import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductSubmissionStatus, SaleUnit } from '@prisma/client';
import { compareTwoStrings } from 'string-similarity';
import { ErrorCodes } from '../common/errors/api-error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateStoreOfferDto } from './dto/create-store-offer.dto';
import { UpdateStoreOfferDto } from './dto/update-store-offer.dto';
import { UpdateProductSubmissionDto } from './dto/update-product-submission.dto';
import {
  ApproveProductSubmissionsBatchDto,
  ApproveProductSubmissionBatchItemDto,
} from './dto/approve-product-submissions-batch.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Categories ──────────────────────────────────────────────────────────

  async createCategory(dto: CreateProductCategoryDto) {
    try {
      return await this.prisma.productCategory.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ErrorCodes.PRODUCT_CATEGORY_DUPLICATE,
          message: 'Category name or slug already exists',
        });
      }
      throw error;
    }
  }

  async listActiveCategories() {
    return this.prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
      },
    });
  }

  async listAdminCategories() {
    return this.prisma.productCategory.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: true } },
      },
    });
  }

  async updateCategory(categoryId: string, dto: UpdateProductCategoryDto) {
    await this.findCategoryOrFail(categoryId);
    try {
      return await this.prisma.productCategory.update({
        where: { id: categoryId },
        data: dto,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ErrorCodes.PRODUCT_CATEGORY_DUPLICATE,
          message: 'Category name or slug already exists',
        });
      }
      throw error;
    }
  }

  async toggleCategory(categoryId: string) {
    const category = await this.findCategoryOrFail(categoryId);
    return this.prisma.productCategory.update({
      where: { id: categoryId },
      data: { isActive: !category.isActive },
    });
  }

  // ── Catalogue global ─────────────────────────────────────────────────────

  async createCatalogProduct(dto: CreateProductDto) {
    await this.findCategoryOrFail(dto.categoryId);
    return this.prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description,
        saleUnit: dto.saleUnit,
        priceInCents: dto.priceInCents,
        categoryId: dto.categoryId,
      },
    });
  }

  async createProductSubmission(userId: string, dto: CreateProductDto) {
    const profile = await this.resolveMerchantProfile(userId);
    await this.findCategoryOrFail(dto.categoryId);

    const existingPending = await this.prisma.productSubmission.findFirst({
      where: {
        merchantId: profile.id,
        categoryId: dto.categoryId,
        name: dto.name,
        status: ProductSubmissionStatus.PENDING,
      },
      select: { id: true },
    });

    if (existingPending) {
      throw new ConflictException({
        code: ErrorCodes.PRODUCT_SUBMISSION_ALREADY_PENDING,
        message: 'A similar product submission is already pending review',
      });
    }

    return this.prisma.productSubmission.create({
      data: {
        merchantId: profile.id,
        name: dto.name,
        description: dto.description,
        saleUnit: dto.saleUnit,
        priceInCents: dto.priceInCents,
        categoryId: dto.categoryId,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  async listMyProductSubmissions(
    userId: string,
    page = 1,
    pageSize = 10,
    status?: ProductSubmissionStatus,
  ) {
    const profile = await this.resolveMerchantProfile(userId);
    const {
      skip,
      take,
      page: safePage,
      pageSize: safePageSize,
    } = this.normalizePagination(page, pageSize);

    const where: Prisma.ProductSubmissionWhereInput = {
      merchantId: profile.id,
      ...(status ? { status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.productSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          approvedProduct: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.productSubmission.count({ where }),
    ]);

    return {
      data,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async listAdminProductSubmissions(
    page = 1,
    pageSize = 10,
    status?: ProductSubmissionStatus,
  ) {
    const {
      skip,
      take,
      page: safePage,
      pageSize: safePageSize,
    } = this.normalizePagination(page, pageSize);

    const where: Prisma.ProductSubmissionWhereInput = status ? { status } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.productSubmission.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
        include: {
          merchant: {
            select: {
              id: true,
              storeName: true,
              slug: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          reviewedByUser: {
            select: {
              id: true,
              email: true,
            },
          },
          approvedProduct: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
        },
      }),
      this.prisma.productSubmission.count({ where }),
    ]);

    return {
      data,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async reviewProductSubmission(
    adminUserId: string,
    submissionId: string,
    status: ProductSubmissionStatus,
    rejectionReason?: string,
    approvedProductOverrides?: {
      name?: string;
      description?: string;
      saleUnit?: SaleUnit;
      priceInCents?: number | null;
      categoryId?: string;
    },
  ) {
    if (
      status !== ProductSubmissionStatus.APPROVED &&
      status !== ProductSubmissionStatus.REJECTED
    ) {
      throw new BadRequestException({
        code: ErrorCodes.PRODUCT_SUBMISSION_INVALID_STATUS,
        message: 'Status must be APPROVED or REJECTED',
      });
    }

    const submission = await this.findSubmissionOrFail(submissionId);

    if (submission.status !== ProductSubmissionStatus.PENDING) {
      throw new BadRequestException({
        code: ErrorCodes.PRODUCT_SUBMISSION_ALREADY_REVIEWED,
        message: 'Only pending submissions can be reviewed',
      });
    }

    if (
      status === ProductSubmissionStatus.REJECTED &&
      !rejectionReason?.trim()
    ) {
      throw new BadRequestException({
        code: ErrorCodes.PRODUCT_SUBMISSION_REJECTION_REASON_REQUIRED,
        message: 'A rejection reason is required when status is REJECTED',
      });
    }

    if (
      status === ProductSubmissionStatus.APPROVED &&
      approvedProductOverrides?.categoryId
    ) {
      await this.findCategoryOrFail(approvedProductOverrides.categoryId);
    }

    if (status === ProductSubmissionStatus.APPROVED) {
      return this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name: approvedProductOverrides?.name ?? submission.name,
            description:
              approvedProductOverrides?.description ?? submission.description,
            saleUnit: approvedProductOverrides?.saleUnit ?? submission.saleUnit,
            priceInCents:
              approvedProductOverrides?.priceInCents ?? submission.priceInCents,
            categoryId:
              approvedProductOverrides?.categoryId ?? submission.categoryId,
            isActive: true,
          },
        });

        return tx.productSubmission.update({
          where: { id: submission.id },
          data: {
            status: ProductSubmissionStatus.APPROVED,
            reviewedAt: new Date(),
            reviewedByUserId: adminUserId,
            approvedProductId: product.id,
            rejectionReason: null,
          },
          include: {
            merchant: {
              select: {
                id: true,
                storeName: true,
                slug: true,
              },
            },
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            approvedProduct: {
              select: {
                id: true,
                name: true,
                isActive: true,
              },
            },
          },
        });
      });
    }

    return this.prisma.productSubmission.update({
      where: { id: submission.id },
      data: {
        status: ProductSubmissionStatus.REJECTED,
        rejectionReason: rejectionReason?.trim(),
        reviewedAt: new Date(),
        reviewedByUserId: adminUserId,
        approvedProductId: null,
      },
      include: {
        merchant: {
          select: {
            id: true,
            storeName: true,
            slug: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  async approveProductSubmissionsBatch(
    adminUserId: string,
    dto: ApproveProductSubmissionsBatchDto,
  ) {
    const uniqueSubmissionIds = new Set<string>();
    for (const item of dto.items) {
      if (uniqueSubmissionIds.has(item.id)) {
        throw new BadRequestException({
          code: ErrorCodes.BAD_REQUEST,
          message: 'Batch payload contains duplicate submission ids',
        });
      }
      uniqueSubmissionIds.add(item.id);
    }

    const itemsById = new Map<string, ApproveProductSubmissionBatchItemDto>(
      dto.items.map((item) => [item.id, item]),
    );

    return this.prisma.$transaction(async (tx) => {
      const submissions = await tx.productSubmission.findMany({
        where: {
          id: { in: Array.from(uniqueSubmissionIds) },
        },
      });

      if (submissions.length !== uniqueSubmissionIds.size) {
        throw new NotFoundException({
          code: ErrorCodes.PRODUCT_SUBMISSION_NOT_FOUND,
          message: 'One or more product submissions were not found',
        });
      }

      const nonPending = submissions.find(
        (submission) => submission.status !== ProductSubmissionStatus.PENDING,
      );
      if (nonPending) {
        throw new BadRequestException({
          code: ErrorCodes.PRODUCT_SUBMISSION_ALREADY_REVIEWED,
          message: 'Only pending submissions can be approved',
        });
      }

      const categoryIds = Array.from(
        new Set(
          dto.items
            .map((item) => item.categoryId)
            .filter((id): id is string => !!id),
        ),
      );

      if (categoryIds.length > 0) {
        const categories = await tx.productCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true },
        });
        if (categories.length !== categoryIds.length) {
          throw new NotFoundException({
            code: ErrorCodes.PRODUCT_CATEGORY_NOT_FOUND,
            message: 'One or more product categories were not found',
          });
        }
      }

      const approvedEntries: Array<{
        submissionId: string;
        productId: string;
      }> = [];

      for (const submission of submissions) {
        const item = itemsById.get(submission.id);
        if (!item) continue;

        const created = await tx.product.create({
          data: {
            name: item.name ?? submission.name,
            description: item.description ?? submission.description,
            saleUnit: item.saleUnit ?? submission.saleUnit,
            priceInCents: item.priceInCents ?? submission.priceInCents,
            categoryId: item.categoryId ?? submission.categoryId,
            isActive: true,
          },
          select: { id: true },
        });

        await tx.productSubmission.update({
          where: { id: submission.id },
          data: {
            status: ProductSubmissionStatus.APPROVED,
            reviewedAt: new Date(),
            reviewedByUserId: adminUserId,
            approvedProductId: created.id,
            rejectionReason: null,
          },
        });

        approvedEntries.push({
          submissionId: submission.id,
          productId: created.id,
        });
      }

      return {
        count: approvedEntries.length,
        data: approvedEntries,
      };
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
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
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

  async listSimilarCatalogProducts(query: string, limit = 5) {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) {
      return [];
    }

    const safeLimit = Math.min(Math.max(limit, 1), 10);

    // Keep strict contains matches first so obvious results are never missed.
    const strictMatches = await this.prisma.product.findMany({
      where: {
        isActive: true,
        name: {
          contains: query.trim(),
        },
      },
      select: {
        id: true,
        name: true,
        saleUnit: true,
        priceInCents: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      take: safeLimit,
    });

    // Fetch a broad pool for fuzzy ranking.
    const allProducts = await this.prisma.product.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        saleUnit: true,
        priceInCents: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      take: 3000,
    });

    if (allProducts.length === 0) {
      return [];
    }

    const strictIds = new Set(strictMatches.map((product) => product.id));

    // Calculate similarity scores for each product name.
    const scoredProducts = allProducts.map((product) => {
      const productNameLower = product.name.toLowerCase();
      const similarity = this.calculateSimilarity(normalized, productNameLower);
      return {
        ...product,
        isStrictMatch: strictIds.has(product.id),
        similarityScore: similarity,
      };
    });

    const MIN_SIMILARITY_THRESHOLD = 0.12;
    const filtered = scoredProducts
      .filter(
        (p) => p.isStrictMatch || p.similarityScore >= MIN_SIMILARITY_THRESHOLD,
      )
      .sort((a, b) => {
        if (a.isStrictMatch !== b.isStrictMatch) {
          return a.isStrictMatch ? -1 : 1;
        }

        if (b.similarityScore !== a.similarityScore) {
          return b.similarityScore - a.similarityScore;
        }

        return a.name.localeCompare(b.name);
      })
      .slice(0, safeLimit);

    // Remove ranking metadata from API response.
    return filtered.map((p) => ({
      id: p.id,
      name: p.name,
      saleUnit: p.saleUnit,
      priceInCents: p.priceInCents,
      category: p.category,
    }));
  }

  private calculateSimilarity(query: string, target: string): number {
    if (target.includes(query)) {
      return 1;
    }

    const queryTokens = query.split(/\s+/).filter(Boolean);
    const targetTokens = target.split(/\s+/).filter(Boolean);
    const tokenOverlap = queryTokens.some((queryToken) =>
      targetTokens.some(
        (targetToken) =>
          targetToken.includes(queryToken) || queryToken.includes(targetToken),
      ),
    );

    const fuzzy = compareTwoStrings(query, target);
    return tokenOverlap ? Math.max(fuzzy, 0.55) : fuzzy;
  }

  async updateMyProductSubmission(
    userId: string,
    submissionId: string,
    dto: UpdateProductSubmissionDto,
  ) {
    const profile = await this.resolveMerchantProfile(userId);
    const submission = await this.findSubmissionOrFail(submissionId);

    if (submission.merchantId !== profile.id) {
      throw new NotFoundException({
        code: ErrorCodes.PRODUCT_SUBMISSION_NOT_FOUND,
        message: 'Product submission not found',
      });
    }

    if (submission.status !== ProductSubmissionStatus.PENDING) {
      throw new BadRequestException({
        code: ErrorCodes.PRODUCT_SUBMISSION_ALREADY_REVIEWED,
        message: 'Only pending submissions can be edited',
      });
    }

    const categoryId = dto.categoryId ?? submission.categoryId;
    const name = dto.name ?? submission.name;

    if (dto.categoryId) {
      await this.findCategoryOrFail(dto.categoryId);
    }

    const duplicatePending = await this.prisma.productSubmission.findFirst({
      where: {
        merchantId: profile.id,
        categoryId,
        name,
        status: ProductSubmissionStatus.PENDING,
        id: { not: submissionId },
      },
      select: { id: true },
    });

    if (duplicatePending) {
      throw new ConflictException({
        code: ErrorCodes.PRODUCT_SUBMISSION_ALREADY_PENDING,
        message: 'A similar product submission is already pending review',
      });
    }

    return this.prisma.productSubmission.update({
      where: { id: submissionId },
      data: dto,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        approvedProduct: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async deleteMyProductSubmission(userId: string, submissionId: string) {
    const profile = await this.resolveMerchantProfile(userId);
    const submission = await this.findSubmissionOrFail(submissionId);

    if (submission.merchantId !== profile.id) {
      throw new NotFoundException({
        code: ErrorCodes.PRODUCT_SUBMISSION_NOT_FOUND,
        message: 'Product submission not found',
      });
    }

    if (submission.status !== ProductSubmissionStatus.PENDING) {
      throw new BadRequestException({
        code: ErrorCodes.PRODUCT_SUBMISSION_ALREADY_REVIEWED,
        message: 'Only pending submissions can be deleted',
      });
    }

    await this.prisma.productSubmission.delete({
      where: { id: submissionId },
    });

    return {
      id: submissionId,
      deleted: true,
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
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
            },
          },
          _count: { select: { storeOffers: true } },
        },
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
    if (dto.categoryId) {
      await this.findCategoryOrFail(dto.categoryId);
    }
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
      throw new ConflictException({
        code: ErrorCodes.OFFER_ALREADY_EXISTS_FOR_PRODUCT,
        message: 'You already have an offer for this product',
      });
    }

    if (dto.priceInCents == null && product.priceInCents == null) {
      throw new BadRequestException({
        code: ErrorCodes.OFFER_PRICE_REQUIRED,
        message:
          'A product default price or an offer override price is required',
      });
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
              category: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
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

  async createOffersBatch(userId: string, offers: CreateStoreOfferDto[]) {
    const profile = await this.resolveMerchantProfile(userId);

    const productIds = offers.map((offer) => offer.productId);
    const duplicateProductIds = productIds.filter(
      (productId, index) => productIds.indexOf(productId) !== index,
    );

    if (duplicateProductIds.length > 0) {
      throw new BadRequestException({
        code: ErrorCodes.BAD_REQUEST,
        message:
          'Batch payload contains duplicate productId values. Each product can appear only once',
      });
    }

    const [products, existingOffers] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: {
          id: true,
          priceInCents: true,
          name: true,
          description: true,
          saleUnit: true,
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      }),
      this.prisma.storeOffer.findMany({
        where: {
          merchantId: profile.id,
          productId: { in: productIds },
        },
        select: {
          productId: true,
        },
      }),
    ]);

    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const missingProductIds = productIds.filter(
      (productId) => !productsById.has(productId),
    );
    if (missingProductIds.length > 0) {
      throw new NotFoundException({
        code: ErrorCodes.PRODUCT_NOT_FOUND,
        message: `Product not found: ${missingProductIds.join(', ')}`,
      });
    }

    const existingProductIds = new Set(
      existingOffers.map((offer) => offer.productId),
    );
    if (existingProductIds.size > 0) {
      throw new ConflictException({
        code: ErrorCodes.OFFER_ALREADY_EXISTS_FOR_PRODUCT,
        message: 'One or more products already have an offer for this merchant',
      });
    }

    for (const offer of offers) {
      const product = productsById.get(offer.productId);
      if (!product) {
        continue;
      }

      if (offer.priceInCents == null && product.priceInCents == null) {
        throw new BadRequestException({
          code: ErrorCodes.OFFER_PRICE_REQUIRED,
          message: `Price required for product ${offer.productId}`,
        });
      }
    }

    const createdOffers = await this.prisma.$transaction(
      offers.map((offer) =>
        this.prisma.storeOffer.create({
          data: {
            merchantId: profile.id,
            productId: offer.productId,
            priceInCents: offer.priceInCents,
            minOrderQty: offer.minOrderQty ?? 1,
            stepQty: offer.stepQty ?? 1,
          },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                description: true,
                saleUnit: true,
                priceInCents: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
        }),
      ),
    );

    return {
      count: createdOffers.length,
      data: createdOffers.map((offer) => ({
        ...offer,
        defaultPriceInCents: offer.product.priceInCents,
        overridePriceInCents: offer.priceInCents,
        effectivePriceInCents: offer.priceInCents ?? offer.product.priceInCents,
        isOverridden: offer.priceInCents != null,
      })),
    };
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
              category: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
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
        throw new BadRequestException({
          code: ErrorCodes.OFFER_PRICE_CLEAR_NOT_ALLOWED,
          message:
            'Cannot clear offer override when product has no default price',
        });
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
              category: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
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
    merchantSlug: string,
    page = 1,
    pageSize = 10,
  ) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { slug: merchantSlug },
    });

    if (!profile || !profile.isActive) {
      throw new NotFoundException({
        code: ErrorCodes.MERCHANT_NOT_FOUND,
        message: 'Merchant not found',
      });
    }

    const {
      skip,
      take,
      page: safePage,
      pageSize: safePageSize,
    } = this.normalizePagination(page, pageSize);

    const where = {
      merchantId: profile.id,
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
              category: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
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

  private async findProductOrFail(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || !product.isActive)
      throw new NotFoundException({
        code: ErrorCodes.PRODUCT_NOT_FOUND,
        message: 'Product not found',
      });
    return product;
  }

  private async findProductOrFailAdmin(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product)
      throw new NotFoundException({
        code: ErrorCodes.PRODUCT_NOT_FOUND,
        message: 'Product not found',
      });
    return product;
  }

  private async findCategoryOrFail(categoryId: string) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException({
        code: ErrorCodes.PRODUCT_CATEGORY_NOT_FOUND,
        message: 'Product category not found',
      });
    }
    return category;
  }

  private async findSubmissionOrFail(submissionId: string) {
    const submission = await this.prisma.productSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) {
      throw new NotFoundException({
        code: ErrorCodes.PRODUCT_SUBMISSION_NOT_FOUND,
        message: 'Product submission not found',
      });
    }
    return submission;
  }

  private async assertOfferOwnership(offerId: string, merchantId: string) {
    const offer = await this.prisma.storeOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer || offer.merchantId !== merchantId) {
      throw new NotFoundException({
        code: ErrorCodes.OFFER_NOT_FOUND,
        message: 'Offer not found',
      });
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
