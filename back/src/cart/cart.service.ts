import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCodes } from '../common/errors/api-error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { customerId: userId },
      include: this.getCartInclude(),
    });

    if (!cart) {
      return {
        merchantId: null,
        items: [],
        totalEstimatedInCents: 0,
      };
    }

    return this.toCartResponse(cart);
  }

  async upsertMyCartItem(userId: string, dto: UpsertCartItemDto) {
    const offer = await this.prisma.storeOffer.findUnique({
      where: { id: dto.storeOfferId },
      include: {
        merchant: { select: { id: true, isActive: true } },
        product: {
          select: {
            id: true,
            name: true,
            saleUnit: true,
            priceInCents: true,
            isActive: true,
          },
        },
      },
    });

    if (!offer || !offer.isActive || !offer.product.isActive) {
      throw new NotFoundException({
        code: ErrorCodes.CART_OFFER_NOT_FOUND,
        message: 'Store offer not found',
      });
    }

    if (!offer.merchant.isActive) {
      throw new ForbiddenException({
        code: ErrorCodes.MERCHANT_ACCOUNT_INACTIVE,
        message: 'Merchant account is inactive',
      });
    }

    const effectivePriceInCents =
      offer.priceInCents ?? offer.product.priceInCents;
    if (effectivePriceInCents == null) {
      throw new BadRequestException({
        code: ErrorCodes.CART_OFFER_NO_EFFECTIVE_PRICE,
        message: 'Offer has no effective price',
      });
    }

    const minOrderQty = Number(offer.minOrderQty);
    const stepQty = Number(offer.stepQty);
    this.assertQuantityConstraints(dto.quantity, minOrderQty, stepQty);

    let cart = await this.prisma.cart.findUnique({
      where: { customerId: userId },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: {
          customerId: userId,
          merchantId: offer.merchantId,
        },
      });
    } else if (cart.merchantId && cart.merchantId !== offer.merchantId) {
      throw new ConflictException({
        code: ErrorCodes.CART_MERCHANT_MISMATCH,
        message:
          'Cart supports only one merchant. Clear your cart before changing merchant.',
      });
    } else if (!cart.merchantId) {
      cart = await this.prisma.cart.update({
        where: { id: cart.id },
        data: { merchantId: offer.merchantId },
      });
    }

    await this.prisma.cartItem.upsert({
      where: {
        cartId_storeOfferId: {
          cartId: cart.id,
          storeOfferId: dto.storeOfferId,
        },
      },
      update: { quantity: dto.quantity },
      create: {
        cartId: cart.id,
        storeOfferId: dto.storeOfferId,
        quantity: dto.quantity,
      },
    });

    const updatedCart = await this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: this.getCartInclude(),
    });

    return this.toCartResponse(updatedCart!);
  }

  async removeMyCartItem(userId: string, itemId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { customerId: userId },
      include: {
        items: true,
      },
    });

    if (!cart) {
      throw new NotFoundException({
        code: ErrorCodes.CART_NOT_FOUND,
        message: 'Cart not found',
      });
    }

    const item = cart.items.find((it) => it.id === itemId);
    if (!item) {
      throw new NotFoundException({
        code: ErrorCodes.CART_ITEM_NOT_FOUND,
        message: 'Cart item not found',
      });
    }

    await this.prisma.cartItem.delete({ where: { id: itemId } });

    const remainingItems = await this.prisma.cartItem.count({
      where: { cartId: cart.id },
    });

    if (remainingItems === 0) {
      await this.prisma.cart.update({
        where: { id: cart.id },
        data: { merchantId: null },
      });
    }

    const updatedCart = await this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: this.getCartInclude(),
    });

    return this.toCartResponse(updatedCart!);
  }

  private assertQuantityConstraints(
    quantity: number,
    minOrderQty: number,
    stepQty: number,
  ) {
    if (quantity < minOrderQty) {
      throw new BadRequestException({
        code: ErrorCodes.CART_QUANTITY_BELOW_MIN,
        message: `Quantity must be >= ${minOrderQty.toString()}`,
      });
    }

    const tolerance = 1e-9;
    const steps = (quantity - minOrderQty) / stepQty;
    if (Math.abs(steps - Math.round(steps)) > tolerance) {
      throw new BadRequestException({
        code: ErrorCodes.CART_QUANTITY_INVALID_STEP,
        message: `Quantity must follow step ${stepQty.toString()} starting from ${minOrderQty.toString()}`,
      });
    }
  }

  private getCartInclude() {
    return {
      merchant: {
        select: { id: true, storeName: true },
      },
      items: {
        orderBy: { createdAt: 'desc' as const },
        include: {
          storeOffer: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  saleUnit: true,
                  priceInCents: true,
                },
              },
            },
          },
        },
      },
    };
  }

  private toCartResponse(cart: any) {
    const items = cart.items
      .map((item: any) => {
        const defaultPriceInCents = item.storeOffer.product.priceInCents;
        const overridePriceInCents = item.storeOffer.priceInCents;
        const effectivePriceInCents =
          overridePriceInCents ?? defaultPriceInCents ?? null;
        if (effectivePriceInCents == null) return null;

        const quantity = Number(item.quantity);
        const lineTotalInCents = Math.round(quantity * effectivePriceInCents);

        return {
          id: item.id,
          quantity,
          lineTotalInCents,
          storeOfferId: item.storeOffer.id,
          product: {
            id: item.storeOffer.product.id,
            name: item.storeOffer.product.name,
            description: item.storeOffer.product.description,
            saleUnit: item.storeOffer.product.saleUnit,
          },
          defaultPriceInCents,
          overridePriceInCents,
          effectivePriceInCents,
          isOverridden: overridePriceInCents != null,
        };
      })
      .filter(Boolean);

    const totalEstimatedInCents = items.reduce(
      (sum: number, item: any) => sum + item.lineTotalInCents,
      0,
    );

    return {
      id: cart.id,
      merchant: cart.merchant,
      merchantId: cart.merchantId,
      items,
      totalEstimatedInCents,
    };
  }
}
