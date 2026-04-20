import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async checkout(userId: string, dto: CheckoutOrderDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { customerId: userId },
      include: {
        items: {
          include: {
            storeOffer: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0 || !cart.merchantId) {
      throw new BadRequestException('Cart is empty');
    }

    const pickupSlot = await this.prisma.pickupSlot.findUnique({
      where: { id: dto.pickupSlotId },
    });

    if (!pickupSlot || !pickupSlot.isActive) {
      throw new NotFoundException('Pickup slot not found');
    }

    if (pickupSlot.merchantId !== cart.merchantId) {
      throw new BadRequestException(
        'Pickup slot does not belong to cart merchant',
      );
    }

    const now = new Date();
    if (pickupSlot.endsAt <= now) {
      throw new BadRequestException('Pickup slot is expired');
    }

    const mappedItems = cart.items.map((item) => {
      const defaultPriceInCents = item.storeOffer.product.priceInCents;
      const overridePriceInCents = item.storeOffer.priceInCents;
      const effectivePriceInCents = overridePriceInCents ?? defaultPriceInCents;

      if (effectivePriceInCents == null) {
        throw new BadRequestException(
          `No effective price found for product ${item.storeOffer.product.name}`,
        );
      }

      const quantity = Number(item.quantity);
      const lineTotalInCents = Math.round(quantity * effectivePriceInCents);

      return {
        storeOfferId: item.storeOfferId,
        productId: item.storeOffer.productId,
        productName: item.storeOffer.product.name,
        saleUnit: item.storeOffer.product.saleUnit,
        quantity,
        unitPriceInCents: effectivePriceInCents,
        lineTotalInCents,
      };
    });

    const estimatedTotalInCents = mappedItems.reduce(
      (sum, item) => sum + item.lineTotalInCents,
      0,
    );

    const order = await this.prisma.$transaction(async (tx) => {
      const reserved = await tx.pickupSlot.updateMany({
        where: {
          id: pickupSlot.id,
          isActive: true,
          currentOrders: { lt: pickupSlot.maxOrders },
        },
        data: {
          currentOrders: {
            increment: 1,
          },
        },
      });

      if (reserved.count === 0) {
        throw new ConflictException('Pickup slot is full');
      }

      const createdOrder = await tx.order.create({
        data: {
          customerId: userId,
          merchantId: cart.merchantId!,
          pickupSlotId: pickupSlot.id,
          pickupStartsAt: pickupSlot.startsAt,
          pickupEndsAt: pickupSlot.endsAt,
          status: OrderStatus.PENDING,
          estimatedTotalInCents,
          note: dto.note,
          items: {
            create: mappedItems,
          },
        },
        include: {
          items: true,
          merchant: {
            select: { id: true, storeName: true },
          },
        },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({
        where: { id: cart.id },
        data: { merchantId: null },
      });

      return createdOrder;
    });

    return order;
  }

  async listMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { customerId: userId },
      include: {
        items: true,
        merchant: { select: { id: true, storeName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyOrderById(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        merchant: { select: { id: true, storeName: true } },
      },
    });

    if (!order || order.customerId !== userId) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async listMerchantOrders(userId: string, status?: OrderStatus) {
    const profile = await this.resolveMerchantProfile(userId);

    return this.prisma.order.findMany({
      where: {
        merchantId: profile.id,
        ...(status ? { status } : {}),
      },
      include: {
        items: true,
        customer: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMerchantOrderById(userId: string, orderId: string) {
    const profile = await this.resolveMerchantProfile(userId);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        customer: { select: { id: true, email: true } },
      },
    });

    if (!order || order.merchantId !== profile.id) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateMerchantOrderStatus(
    userId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ) {
    const profile = await this.resolveMerchantProfile(userId);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.merchantId !== profile.id) {
      throw new NotFoundException('Order not found');
    }

    this.assertStatusTransitionAllowed(order.status, dto.status);

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: dto.status,
        collectedAt: dto.status === OrderStatus.COLLECTED ? new Date() : null,
        cancelledAt: dto.status === OrderStatus.CANCELLED ? new Date() : null,
      },
      include: {
        items: true,
        customer: { select: { id: true, email: true } },
      },
    });
  }

  private assertStatusTransitionAllowed(
    current: OrderStatus,
    next: OrderStatus,
  ) {
    if (current === next) return;

    const allowed: Record<OrderStatus, OrderStatus[]> = {
      PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      CONFIRMED: [OrderStatus.READY, OrderStatus.CANCELLED],
      READY: [OrderStatus.COLLECTED],
      COLLECTED: [],
      CANCELLED: [],
    };

    if (!allowed[current].includes(next)) {
      throw new BadRequestException(
        `Invalid status transition from ${current} to ${next}`,
      );
    }
  }

  private async resolveMerchantProfile(userId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!profile) throw new NotFoundException('Merchant profile not found');
    if (!profile.isActive)
      throw new ForbiddenException('Merchant account is inactive');

    return profile;
  }
}
