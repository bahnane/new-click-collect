import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateStoreOfferDto } from './dto/create-store-offer.dto';
import { UpdateStoreOfferDto } from './dto/update-store-offer.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Catalogue global ─────────────────────────────────────────────────────

  async createCatalogProduct(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description,
        saleUnit: dto.saleUnit,
        priceInCents: dto.priceInCents,
      },
    });
  }

  async listCatalogProducts(page = 1, pageSize = 10) {
    const {
      skip,
      take,
      page: safePage,
      pageSize: safePageSize,
    } = this.normalizePagination(page, pageSize);

    const where = { isActive: true };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          description: true,
          saleUnit: true,
          priceInCents: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async listAdminCatalog(page = 1, pageSize = 10) {
    const {
      skip,
      take,
      page: safePage,
      pageSize: safePageSize,
    } = this.normalizePagination(page, pageSize);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        orderBy: { name: 'asc' },
        skip,
        take,
        include: { _count: { select: { storeOffers: true } } },
      }),
      this.prisma.product.count(),
    ]);

    return {
      data,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async updateCatalogProduct(productId: string, dto: UpdateProductDto) {
    await this.findProductOrFailAdmin(productId);
    return this.prisma.product.update({
      where: { id: productId },
      data: dto,
    });
  }

  async toggleCatalogProduct(productId: string) {
    const product = await this.findProductOrFailAdmin(productId);
    return this.prisma.product.update({
      where: { id: productId },
      data: { isActive: !product.isActive },
    });
  }

  // ── Store offers (offres marchandes) ────────────────────────────────────

  async createOffer(userId: string, dto: CreateStoreOfferDto) {
    const profile = await this.resolveMerchantProfile(userId);
    const product = await this.findProductOrFail(dto.productId);

    const existing = await this.prisma.storeOffer.findUnique({
      where: {
        merchantId_productId: {
          merchantId: profile.id,
          productId: dto.productId,
        },
      },
    });
    if (existing) {
      throw new ConflictException('You already have an offer for this product');
    }

    if (dto.priceInCents == null && product.priceInCents == null) {
      throw new BadRequestException(
        'A product default price or an offer override price is required',
      );
    }

    return this.prisma.storeOffer
      .create({
        data: {
          merchantId: profile.id,
          productId: dto.productId,
          priceInCents: dto.priceInCents,
          minOrderQty: dto.minOrderQty ?? 1,
          stepQty: dto.stepQty ?? 1,
        },
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
      })
      .then((offer) => ({
        ...offer,
        defaultPriceInCents: offer.product.priceInCents,
        overridePriceInCents: offer.priceInCents,
        effectivePriceInCents: offer.priceInCents ?? offer.product.priceInCents,
        isOverridden: offer.priceInCents != null,
      }));
  }

  async getMyOffers(userId: string, page = 1, pageSize = 10) {
    const profile = await this.resolveMerchantProfile(userId);
    const {
      skip,
      take,
      page: safePage,
      pageSize: safePageSize,
    } = this.normalizePagination(page, pageSize);

    const where = { merchantId: profile.id };
    const [offers, total] = await this.prisma.$transaction([
      this.prisma.storeOffer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
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
      }),
      this.prisma.storeOffer.count({ where }),
    ]);

    return {
      data: offers.map((offer) => ({
        ...offer,
        defaultPriceInCents: offer.product.priceInCents,
        overridePriceInCents: offer.priceInCents,
        effectivePriceInCents: offer.priceInCents ?? offer.product.priceInCents,
        isOverridden: offer.priceInCents != null,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async updateOffer(userId: string, offerId: string, dto: UpdateStoreOfferDto) {
    const profile = await this.resolveMerchantProfile(userId);
    const existingOffer = await this.assertOfferOwnership(offerId, profile.id);

    if (dto.priceInCents === null) {
      const product = await this.findProductOrFail(existingOffer.productId);
      if (product.priceInCents == null) {
        throw new BadRequestException(
          'Cannot clear offer override when product has no default price',
        );
      }
    }

    return this.prisma.storeOffer
      .update({
        where: { id: offerId },
        data: dto,
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
      })
      .then((offer) => ({
        ...offer,
        defaultPriceInCents: offer.product.priceInCents,
        overridePriceInCents: offer.priceInCents,
        effectivePriceInCents: offer.priceInCents ?? offer.product.priceInCents,
        isOverridden: offer.priceInCents != null,
      }));
  }

  async toggleOffer(userId: string, offerId: string) {
    const profile = await this.resolveMerchantProfile(userId);
    const offer = await this.assertOfferOwnership(offerId, profile.id);

    return this.prisma.storeOffer
      .update({
        where: { id: offerId },
        data: { isActive: !offer.isActive },
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
      })
      .then((updatedOffer) => ({
        ...updatedOffer,
        defaultPriceInCents: updatedOffer.product.priceInCents,
        overridePriceInCents: updatedOffer.priceInCents,
        effectivePriceInCents:
          updatedOffer.priceInCents ?? updatedOffer.product.priceInCents,
        isOverridden: updatedOffer.priceInCents != null,
      }));
  }

  // ── Public ───────────────────────────────────────────────────────────────

  async getPublicOffersForMerchant(
    merchantProfileId: string,
    page = 1,
    pageSize = 10,
  ) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { id: merchantProfileId },
    });

    if (!profile || !profile.isActive) {
      throw new NotFoundException('Merchant not found');
    }

    const {
      skip,
      take,
      page: safePage,
      pageSize: safePageSize,
    } = this.normalizePagination(page, pageSize);

    const where = {
      merchantId: merchantProfileId,
      isActive: true,
      OR: [
        { priceInCents: { not: null } },
        { product: { priceInCents: { not: null } } },
      ],
    };

    const [offers, total] = await this.prisma.$transaction([
      this.prisma.storeOffer.findMany({
        where,
        orderBy: { product: { name: 'asc' } },
        skip,
        take,
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
      }),
      this.prisma.storeOffer.count({ where }),
    ]);

    return {
      data: offers.map((offer) => ({
        ...offer,
        defaultPriceInCents: offer.product.priceInCents,
        overridePriceInCents: offer.priceInCents,
        effectivePriceInCents: offer.priceInCents ?? offer.product.priceInCents,
        isOverridden: offer.priceInCents != null,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async resolveMerchantProfile(userId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!profile) throw new NotFoundException('Merchant profile not found');
    if (!profile.isActive)
      throw new ForbiddenException('Merchant account is inactive');

    return profile;
  }

  private async findProductOrFail(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || !product.isActive)
      throw new NotFoundException('Product not found');
    return product;
  }

  private async findProductOrFailAdmin(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async assertOfferOwnership(offerId: string, merchantId: string) {
    const offer = await this.prisma.storeOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer || offer.merchantId !== merchantId) {
      throw new NotFoundException('Offer not found');
    }
    return offer;
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
}
