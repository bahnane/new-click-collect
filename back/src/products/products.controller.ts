import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductSubmissionStatus, Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { ErrorCodes } from '../common/errors/api-error-codes';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateStoreOfferDto } from './dto/create-store-offer.dto';
import { CreateStoreOffersBatchDto } from './dto/create-store-offers-batch.dto';
import { UpdateStoreOfferDto } from './dto/update-store-offer.dto';
import { ReviewProductSubmissionDto } from './dto/review-product-submission.dto';
import { UpdateProductSubmissionDto } from './dto/update-product-submission.dto';
import { ApproveProductSubmissionsBatchDto } from './dto/approve-product-submissions-batch.dto';
import { CreateImageAssetDto } from './dto/create-image-asset.dto';
import { GenerateImageUploadUrlDto } from './dto/generate-image-upload-url.dto';
import { FinalizeImageUploadDto } from './dto/finalize-image-upload.dto';
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
  @Post('admin/image-assets')
  createImageAsset(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateImageAssetDto,
  ) {
    this.assertAdmin(user);
    return this.productsService.createImageAsset(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/image-assets/upload-url')
  generateImageUploadUrl(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateImageUploadUrlDto,
  ) {
    this.assertAdmin(user);
    return this.productsService.generateImageUploadUrl(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/image-assets/finalize')
  finalizeImageUpload(
    @CurrentUser() user: JwtPayload,
    @Body() dto: FinalizeImageUploadDto,
  ) {
    this.assertAdmin(user);
    return this.productsService.finalizeImageUpload(dto);
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

  @Get('products/similar')
  listSimilarCatalogProducts(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    const normalizedQuery = query?.trim() ?? '';
    if (!normalizedQuery) {
      return [];
    }

    return this.productsService.listSimilarCatalogProducts(
      normalizedQuery,
      this.toPositiveInt(limit, 5),
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

    if (user.role === Role.ADMIN) {
      return this.productsService.createCatalogProduct(dto);
    }

    if (user.role === Role.MERCHANT) {
      if (dto.imageAssetId) {
        throw new ForbiddenException({
          code: ErrorCodes.AUTH_FORBIDDEN,
          message: 'Only admins can attach images during product approval',
        });
      }
      return this.productsService.createProductSubmission(user.sub, dto);
    }

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

  @UseGuards(JwtAuthGuard)
  @Get('merchants/me/product-submissions')
  listMyProductSubmissions(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    this.assertMerchant(user);
    return this.productsService.listMyProductSubmissions(
      user.sub,
      this.toPositiveInt(page, 1),
      this.toPositiveInt(pageSize, 10),
      this.parseSubmissionStatus(status),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('merchants/me/product-submissions/:id')
  updateMyProductSubmission(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductSubmissionDto,
  ) {
    this.assertMerchant(user);
    return this.productsService.updateMyProductSubmission(user.sub, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('merchants/me/product-submissions/:id')
  deleteMyProductSubmission(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    this.assertMerchant(user);
    return this.productsService.deleteMyProductSubmission(user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/product-submissions')
  listAdminProductSubmissions(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    this.assertAdmin(user);
    return this.productsService.listAdminProductSubmissions(
      this.toPositiveInt(page, 1),
      this.toPositiveInt(pageSize, 10),
      this.parseSubmissionStatus(status),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/product-submissions/:id')
  reviewProductSubmission(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReviewProductSubmissionDto,
  ) {
    this.assertAdmin(user);
    return this.productsService.reviewProductSubmission(
      user.sub,
      id,
      dto.status,
      dto.rejectionReason,
      {
        name: dto.name,
        subCategoryId: dto.subCategoryId,
        description: dto.description,
        saleUnit: dto.saleUnit,
        priceInCents: dto.priceInCents,
        categoryId: dto.categoryId,
        imageAssetId: dto.imageAssetId,
      },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/product-submissions/approve-batch')
  approveProductSubmissionsBatch(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ApproveProductSubmissionsBatchDto,
  ) {
    this.assertAdmin(user);
    return this.productsService.approveProductSubmissionsBatch(user.sub, dto);
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
  @Post('merchants/me/offers/batch')
  createOffersBatch(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateStoreOffersBatchDto,
  ) {
    this.assertMerchant(user);
    return this.productsService.createOffersBatch(user.sub, dto.offers);
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

  @Get('merchants/:merchantSlug/products')
  getPublicOffersForMerchant(
    @Param('merchantSlug') merchantSlug: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('q') query?: string,
  ) {
    return this.productsService.getPublicOffersForMerchant(
      merchantSlug,
      this.toPositiveInt(limit, 24),
      cursor?.trim(),
      query?.trim(),
    );
  }

  @Get('merchants/:merchantSlug/categories')
  listPublicRootCategoriesForMerchant(
    @Param('merchantSlug') merchantSlug: string,
  ) {
    return this.productsService.listPublicRootCategoriesForMerchant(
      merchantSlug,
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private assertMerchant(user: JwtPayload): void {
    if (!user || user.role !== Role.MERCHANT) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTH_FORBIDDEN,
        message: 'Requires role: MERCHANT',
      });
    }
  }

  private assertAdmin(user: JwtPayload): void {
    if (!user || user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTH_FORBIDDEN,
        message: 'Requires role: ADMIN',
      });
    }
  }

  private assertMerchantOrAdmin(user: JwtPayload): void {
    if (!user || (user.role !== Role.MERCHANT && user.role !== Role.ADMIN)) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTH_FORBIDDEN,
        message: 'Requires role: MERCHANT or ADMIN',
      });
    }
  }

  private toPositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private parseSubmissionStatus(
    rawStatus: string | undefined,
  ): ProductSubmissionStatus | undefined {
    if (!rawStatus) return undefined;
    const normalized = rawStatus.toUpperCase();
    if (!(normalized in ProductSubmissionStatus)) {
      throw new BadRequestException({
        code: ErrorCodes.PRODUCT_SUBMISSION_INVALID_STATUS,
        message:
          'Invalid submission status filter. Use PENDING, APPROVED or REJECTED',
      });
    }
    return ProductSubmissionStatus[
      normalized as keyof typeof ProductSubmissionStatus
    ];
  }
}
