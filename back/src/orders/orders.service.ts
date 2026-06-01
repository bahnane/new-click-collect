import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Prisma } from '@prisma/client';
import { ErrorCodes } from '../common/errors/api-error-codes';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

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
      throw new BadRequestException({
        code: ErrorCodes.CART_EMPTY,
        message: 'Cart is empty',
      });
    }

    const pickupSlot = await this.prisma.pickupSlot.findUnique({
      where: { id: dto.pickupSlotId },
      include: {
        merchant: { select: { pickupSlotCapacity: true } },
      },
    });

    if (!pickupSlot || !pickupSlot.isActive) {
      throw new NotFoundException({
        code: ErrorCodes.ORDER_PICKUP_SLOT_NOT_FOUND,
        message: 'Pickup slot not found',
      });
    }

    if (pickupSlot.merchantId !== cart.merchantId) {
      throw new BadRequestException({
        code: ErrorCodes.ORDER_PICKUP_SLOT_MERCHANT_MISMATCH,
        message: 'Pickup slot does not belong to cart merchant',
      });
    }

    const now = new Date();
    if (pickupSlot.startsAt <= now) {
      throw new BadRequestException({
        code: ErrorCodes.ORDER_PICKUP_SLOT_ALREADY_STARTED,
        message: 'Pickup slot has already started',
      });
    }

    if (pickupSlot.endsAt <= now) {
      throw new BadRequestException({
        code: ErrorCodes.ORDER_PICKUP_SLOT_EXPIRED,
        message: 'Pickup slot is expired',
      });
    }

    const mappedItems = cart.items.map((item) => {
      const defaultPriceInCents = item.storeOffer.product.priceInCents;
      const overridePriceInCents = item.storeOffer.priceInCents;
      const effectivePriceInCents = overridePriceInCents ?? defaultPriceInCents;

      if (effectivePriceInCents == null) {
        throw new BadRequestException({
          code: ErrorCodes.ORDER_ITEM_PRICE_MISSING,
          message: `No effective price found for product ${item.storeOffer.product.name}`,
        });
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
          startsAt: { gt: now },
          currentOrders: { lt: pickupSlot.merchant.pickupSlotCapacity },
        },
        data: {
          currentOrders: {
            increment: 1,
          },
        },
      });

      if (reserved.count === 0) {
        throw new ConflictException({
          code: ErrorCodes.ORDER_PICKUP_SLOT_UNAVAILABLE,
          message: 'Pickup slot is no longer available',
        });
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

    await this.notifyOrderStatusChange(order.id, OrderStatus.PENDING);

    return order;
  }

  async listMyOrders(userId: string, page = 1, pageSize = 10) {
    const {
      skip,
      take,
      page: safePage,
      pageSize: safePageSize,
    } = this.normalizePagination(page, pageSize);

    const where = { customerId: userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          status: true,
          estimatedTotalInCents: true,
          finalTotalInCents: true,
          pickupStartsAt: true,
          pickupEndsAt: true,
          cancellationReason: true,
          createdAt: true,
          merchant: { select: { id: true, storeName: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        ...row,
        itemCount: row._count.items,
        _count: undefined,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
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
      throw new NotFoundException({
        code: ErrorCodes.ORDER_NOT_FOUND,
        message: 'Order not found',
      });
    }

    return order;
  }

  async cancelMyOrder(userId: string, orderId: string) {
    const cancelledAt = new Date();

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          customerId: true,
          status: true,
          pickupStartsAt: true,
          pickupSlotId: true,
        },
      });

      if (!order || order.customerId !== userId) {
        throw new NotFoundException({
          code: ErrorCodes.ORDER_NOT_FOUND,
          message: 'Order not found',
        });
      }

      this.assertCustomerCancellationAllowed(
        order.status,
        order.pickupStartsAt,
      );

      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          customerId: userId,
          status: OrderStatus.PENDING,
        },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt,
          collectedAt: null,
          cancellationReason: null,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ErrorCodes.ORDER_STATUS_CONFLICT,
          message: 'Order status changed. Please refresh and retry.',
        });
      }

      await this.decrementPickupSlotCurrentOrders(tx, order.pickupSlotId);

      return tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          merchant: { select: { id: true, storeName: true } },
        },
      });
    });

    if (!updatedOrder) {
      throw new NotFoundException({
        code: ErrorCodes.ORDER_NOT_FOUND,
        message: 'Order not found',
      });
    }

    await this.notifyOrderStatusChange(updatedOrder.id, updatedOrder.status);

    return updatedOrder;
  }

  async listMerchantOrders(
    userId: string,
    status: string | undefined,
    page = 1,
    pageSize = 10,
  ) {
    const profile = await this.resolveMerchantProfile(userId);

    const parsedStatus = this.parseOrderStatus(status);
    const {
      skip,
      take,
      page: safePage,
      pageSize: safePageSize,
    } = this.normalizePagination(page, pageSize);

    const where = {
      merchantId: profile.id,
      ...(parsedStatus ? { status: parsedStatus } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          status: true,
          estimatedTotalInCents: true,
          finalTotalInCents: true,
          pickupStartsAt: true,
          pickupEndsAt: true,
          cancellationReason: true,
          createdAt: true,
          customer: { select: { id: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        ...row,
        itemCount: row._count.items,
        _count: undefined,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
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
      throw new NotFoundException({
        code: ErrorCodes.ORDER_NOT_FOUND,
        message: 'Order not found',
      });
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
      throw new NotFoundException({
        code: ErrorCodes.ORDER_NOT_FOUND,
        message: 'Order not found',
      });
    }

    this.assertStatusTransitionAllowed(order.status, dto.status);

    const cancellationReason =
      dto.status === OrderStatus.CANCELLED
        ? this.requireMerchantCancellationReason(dto.cancellationReason)
        : null;

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const nextCancelledAt =
        dto.status === OrderStatus.CANCELLED ? new Date() : null;
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: dto.status,
          collectedAt: dto.status === OrderStatus.COLLECTED ? new Date() : null,
          cancelledAt: nextCancelledAt,
          cancellationReason,
        },
        include: {
          items: true,
          customer: { select: { id: true, email: true } },
        },
      });

      if (dto.status === OrderStatus.CANCELLED) {
        await this.decrementPickupSlotCurrentOrders(tx, order.pickupSlotId);
      }

      return updated;
    });

    await this.notifyOrderStatusChange(updatedOrder.id, updatedOrder.status);

    return updatedOrder;
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
      throw new BadRequestException({
        code: ErrorCodes.ORDER_INVALID_STATUS_TRANSITION,
        message: `Invalid status transition from ${current} to ${next}`,
      });
    }
  }

  private assertCustomerCancellationAllowed(
    currentStatus: OrderStatus,
    pickupStartsAt: Date,
  ) {
    if (currentStatus !== OrderStatus.PENDING) {
      throw new BadRequestException({
        code: ErrorCodes.ORDER_CANCELLATION_NOT_ALLOWED_STATUS,
        message: `Order cannot be cancelled from status ${currentStatus}`,
      });
    }

    const now = new Date();
    if (pickupStartsAt <= now) {
      throw new BadRequestException({
        code: ErrorCodes.ORDER_CANCELLATION_PICKUP_STARTED,
        message: 'Order can no longer be cancelled because pickup has started',
      });
    }

    const cutoffMinutes = this.getCustomerCancellationCutoffMinutes();
    const cancellationDeadline = new Date(
      pickupStartsAt.getTime() - cutoffMinutes * 60_000,
    );

    if (now >= cancellationDeadline) {
      throw new BadRequestException({
        code: ErrorCodes.ORDER_CANCELLATION_DEADLINE_PASSED,
        message: `Order can only be cancelled at least ${cutoffMinutes} minute(s) before pickup`,
      });
    }
  }

  private getCustomerCancellationCutoffMinutes() {
    const raw =
      this.configService.get<string>('ORDER_CANCEL_CUTOFF_MINUTES') ?? '60';
    const parsed = Number.parseInt(raw, 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return 60;
    }

    return parsed;
  }

  private requireMerchantCancellationReason(
    reason: string | undefined,
  ): string {
    const normalized = reason?.trim();
    if (!normalized) {
      throw new BadRequestException({
        code: ErrorCodes.ORDER_CANCELLATION_REASON_REQUIRED,
        message: 'Cancellation reason is required when merchant cancels order',
      });
    }

    return normalized;
  }

  private async decrementPickupSlotCurrentOrders(
    tx: Prisma.TransactionClient,
    pickupSlotId: string,
  ) {
    await tx.pickupSlot.updateMany({
      where: {
        id: pickupSlotId,
        currentOrders: { gt: 0 },
      },
      data: {
        currentOrders: { decrement: 1 },
      },
    });
  }

  private async resolveMerchantProfile(userId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!profile)
      throw new NotFoundException({
        code: ErrorCodes.MERCHANT_PROFILE_NOT_FOUND,
        message: 'Merchant profile not found',
      });
    if (!profile.isActive)
      throw new ForbiddenException({
        code: ErrorCodes.MERCHANT_ACCOUNT_INACTIVE,
        message: 'Merchant account is inactive',
      });

    return profile;
  }

  private normalizePagination(page: number, pageSize: number) {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safePageSize =
      Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 10;

    return {
      page: safePage,
      pageSize: safePageSize,
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    };
  }

  private parseOrderStatus(raw: string | undefined): OrderStatus | undefined {
    if (!raw) return undefined;

    const normalized = raw.toUpperCase();
    if ((Object.values(OrderStatus) as string[]).includes(normalized)) {
      return normalized as OrderStatus;
    }

    throw new BadRequestException({
      code: ErrorCodes.ORDER_INVALID_STATUS_FILTER,
      message: `Invalid status filter. Allowed values: ${Object.values(OrderStatus).join(', ')}`,
    });
  }

  private async notifyOrderStatusChange(
    orderId: string,
    status: OrderStatus,
  ): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          estimatedTotalInCents: true,
          finalTotalInCents: true,
          pickupStartsAt: true,
          pickupEndsAt: true,
          cancellationReason: true,
          customer: {
            select: {
              email: true,
              preferredLanguage: true,
            },
          },
          merchant: {
            select: {
              storeName: true,
              user: {
                select: {
                  email: true,
                  preferredLanguage: true,
                },
              },
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      });

      if (!order) {
        this.logger.warn(
          `Order ${orderId} not found for notification dispatch`,
        );
        return;
      }

      const payload = {
        orderId: order.id,
        storeName: order.merchant.storeName,
        totalInCents: order.finalTotalInCents ?? order.estimatedTotalInCents,
        itemCount: order._count.items,
        pickupStartsAt: order.pickupStartsAt,
        pickupEndsAt: order.pickupEndsAt,
      };

      if (status === OrderStatus.PENDING) {
        await Promise.all([
          this.mailService.sendCustomerOrderPendingEmail(
            order.customer.email,
            payload,
            order.customer.preferredLanguage,
          ),
          this.mailService.sendMerchantNewOrderEmail(
            order.merchant.user.email,
            payload,
            order.merchant.user.preferredLanguage,
          ),
        ]);
        return;
      }

      if (
        status !== OrderStatus.CONFIRMED &&
        status !== OrderStatus.READY &&
        status !== OrderStatus.COLLECTED &&
        status !== OrderStatus.CANCELLED
      ) {
        return;
      }

      await this.mailService.sendCustomerOrderStatusEmail(
        order.customer.email,
        {
          ...payload,
          status,
          cancellationReason: order.cancellationReason,
        },
        order.customer.preferredLanguage,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send order notification for ${orderId}: ${message}`,
      );
    }
  }
}
