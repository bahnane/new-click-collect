import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateStoreOfferDto } from './dto/create-store-offer.dto';
import { UpdateStoreOfferDto } from './dto/update-store-offer.dto';
import { ProductsService } from './products.service';

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ── Catalogue — public ──────────────────────────────────────────────────

  @Get('products')
  listCatalogProducts() {
    return this.productsService.listCatalogProducts();
  }

  // ── Catalogue — MERCHANT ou ADMIN (création) ────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('products')
  createCatalogProduct(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProductDto,
  ) {
    this.assertMerchantOrAdmin(user);
    return this.productsService.createCatalogProduct(dto);
  }

  // ── Catalogue — ADMIN ───────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('admin/products')
  listAdminCatalog(@CurrentUser() user: JwtPayload) {
    this.assertAdmin(user);
    return this.productsService.listAdminCatalog();
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/products/:id')
  updateCatalogProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    this.assertAdmin(user);
    return this.productsService.updateCatalogProduct(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/products/:id/toggle')
  toggleCatalogProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    return this.productsService.toggleCatalogProduct(id);
  }

  // ── Store offers — MERCHANT ─────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('merchants/me/offers')
  createOffer(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateStoreOfferDto,
  ) {
    this.assertMerchant(user);
    return this.productsService.createOffer(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('merchants/me/offers')
  getMyOffers(@CurrentUser() user: JwtPayload) {
    this.assertMerchant(user);
    return this.productsService.getMyOffers(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('merchants/me/offers/:id')
  updateOffer(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateStoreOfferDto,
  ) {
    this.assertMerchant(user);
    return this.productsService.updateOffer(user.sub, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('merchants/me/offers/:id/toggle')
  toggleOffer(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    this.assertMerchant(user);
    return this.productsService.toggleOffer(user.sub, id);
  }

  // ── Public — produits d'un marchand ─────────────────────────────────────

  @Get('merchants/:merchantId/products')
  getPublicOffersForMerchant(@Param('merchantId') merchantId: string) {
    return this.productsService.getPublicOffersForMerchant(merchantId);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private assertMerchant(user: JwtPayload): void {
    if (!user || user.role !== Role.MERCHANT) {
      throw new ForbiddenException('Requires role: MERCHANT');
    }
  }

  private assertAdmin(user: JwtPayload): void {
    if (!user || user.role !== Role.ADMIN) {
      throw new ForbiddenException('Requires role: ADMIN');
    }
  }

  private assertMerchantOrAdmin(user: JwtPayload): void {
    if (!user || (user.role !== Role.MERCHANT && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('Requires role: MERCHANT or ADMIN');
    }
  }
}
