import {
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
      },
    });
  }

  async listCatalogProducts() {
    return this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true, saleUnit: true },
    });
  }

  async listAdminCatalog() {
    return this.prisma.product.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { storeOffers: true } } },
    });
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
    await this.findProductOrFail(dto.productId);

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

    return this.prisma.storeOffer.create({
      data: {
        merchantId: profile.id,
        productId: dto.productId,
        priceInCents: dto.priceInCents,
        minOrderQty: dto.minOrderQty ?? 1,
        stepQty: dto.stepQty ?? 1,
      },
      include: { product: true },
    });
  }

  async getMyOffers(userId: string) {
    const profile = await this.resolveMerchantProfile(userId);
    return this.prisma.storeOffer.findMany({
      where: { merchantId: profile.id },
      orderBy: { createdAt: 'desc' },
      include: { product: true },
    });
  }

  async updateOffer(userId: string, offerId: string, dto: UpdateStoreOfferDto) {
    const profile = await this.resolveMerchantProfile(userId);
    await this.assertOfferOwnership(offerId, profile.id);

    return this.prisma.storeOffer.update({
      where: { id: offerId },
      data: dto,
      include: { product: true },
    });
  }

  async toggleOffer(userId: string, offerId: string) {
    const profile = await this.resolveMerchantProfile(userId);
    const offer = await this.assertOfferOwnership(offerId, profile.id);

    return this.prisma.storeOffer.update({
      where: { id: offerId },
      data: { isActive: !offer.isActive },
      include: { product: true },
    });
  }

  // ── Public ───────────────────────────────────────────────────────────────

  async getPublicOffersForMerchant(merchantProfileId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { id: merchantProfileId },
    });

    if (!profile || !profile.isActive) {
      throw new NotFoundException('Merchant not found');
    }

    return this.prisma.storeOffer.findMany({
      where: { merchantId: merchantProfileId, isActive: true },
      orderBy: { product: { name: 'asc' } },
      include: {
        product: {
          select: { id: true, name: true, description: true, saleUnit: true },
        },
      },
    });
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
}
