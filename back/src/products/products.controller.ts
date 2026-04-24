import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateStoreOfferDto } from './dto/create-store-offer.dto';
import { UpdateStoreOfferDto } from './dto/update-store-offer.dto';
import { ProductsService } from './products.service';

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ── Categories — public ─────────────────────────────────────────────────

  @Get('product-categories')
  listProductCategories() {
    return this.productsService.listActiveCategories();
  }

  // ── Categories — ADMIN ──────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('admin/product-categories')
  createProductCategory(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProductCategoryDto,
  ) {
    this.assertAdmin(user);
    return this.productsService.createCategory(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/product-categories')
  listAdminProductCategories(@CurrentUser() user: JwtPayload) {
    this.assertAdmin(user);
    return this.productsService.listAdminCategories();
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/product-categories/:id')
  updateProductCategory(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    this.assertAdmin(user);
    return this.productsService.updateCategory(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/product-categories/:id/toggle')
  toggleProductCategory(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    return this.productsService.toggleCategory(id);
  }

  // ── Catalogue — public ──────────────────────────────────────────────────

  @Get('products')
  listCatalogProducts(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.productsService.listCatalogProducts(
      this.toPositiveInt(page, 1),
      this.toPositiveInt(pageSize, 10),
    );
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
  listAdminCatalog(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.assertAdmin(user);
    return this.productsService.listAdminCatalog(
      this.toPositiveInt(page, 1),
      this.toPositiveInt(pageSize, 10),
    );
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
  getMyOffers(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.assertMerchant(user);
    return this.productsService.getMyOffers(
      user.sub,
      this.toPositiveInt(page, 1),
      this.toPositiveInt(pageSize, 10),
    );
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
  getPublicOffersForMerchant(
    @Param('merchantId') merchantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.productsService.getPublicOffersForMerchant(
      merchantId,
      this.toPositiveInt(page, 1),
      this.toPositiveInt(pageSize, 10),
    );
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

  private toPositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
