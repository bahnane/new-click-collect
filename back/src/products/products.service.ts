import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  MerchantProfileStatus,
  Prisma,
  ProductSubmissionStatus,
  SaleUnit,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { compareTwoStrings } from 'string-similarity';
import { ErrorCodes } from '../common/errors/api-error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { CreateImageAssetDto } from './dto/create-image-asset.dto';
import { FinalizeImageUploadDto } from './dto/finalize-image-upload.dto';
import { GenerateImageUploadUrlDto } from './dto/generate-image-upload-url.dto';
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
  private readonly logger = new Logger(ProductsService.name);
  private readonly objectStorageBucket: string;
  private readonly objectStorageProvider: string;
  private readonly objectStorageCdnBaseUrl: string;
  private readonly presignedUploadExpiresSeconds: number;
  private readonly maxUploadBytes: number;
  private readonly allowedMimeTypes: Set<string>;
  private readonly orphanRetentionHours: number;
  private readonly orphanCleanupBatchSize: number;
  private readonly orphanCleanupEnabled: boolean;
  private readonly s3Client: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.objectStorageProvider =
      this.configService.get<string>('OBJECT_STORAGE_PROVIDER') ?? 's3';
    this.objectStorageBucket =
      this.configService.get<string>('OBJECT_STORAGE_BUCKET') ?? '';
    this.objectStorageCdnBaseUrl = this.normalizeBaseUrl(
      this.configService.get<string>('OBJECT_STORAGE_CDN_BASE_URL') ?? '',
    );
    this.presignedUploadExpiresSeconds = Number.parseInt(
      this.configService.get<string>(
        'OBJECT_STORAGE_PRESIGN_EXPIRES_SECONDS',
      ) ?? '900',
      10,
    );
    this.maxUploadBytes = Number.parseInt(
      this.configService.get<string>('IMAGE_MAX_UPLOAD_BYTES') ?? '8388608',
      10,
    );
    this.orphanRetentionHours = Number.parseInt(
      this.configService.get<string>('IMAGE_ORPHAN_RETENTION_HOURS') ?? '48',
      10,
    );
    this.orphanCleanupBatchSize = Number.parseInt(
      this.configService.get<string>('IMAGE_ORPHAN_CLEANUP_BATCH_SIZE') ??
        '100',
      10,
    );
    this.orphanCleanupEnabled =
      (this.configService.get<string>('IMAGE_ORPHAN_CLEANUP_ENABLED') ??
        'true') === 'true';

    const allowedMimeTypesRaw =
      this.configService.get<string>('IMAGE_ALLOWED_MIME_TYPES') ??
      'image/jpeg,image/png,image/webp,image/avif';
    this.allowedMimeTypes = new Set(
      allowedMimeTypesRaw
        .split(',')
        .map((mime) => mime.trim().toLowerCase())
        .filter((mime) => mime.length > 0),
    );

    this.s3Client = new S3Client({
      region: this.configService.get<string>('OBJECT_STORAGE_REGION') ?? 'auto',
      endpoint: this.configService.get<string>('OBJECT_STORAGE_ENDPOINT'),
      credentials:
        this.configService.get<string>('OBJECT_STORAGE_ACCESS_KEY_ID') &&
        this.configService.get<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY')
          ? {
              accessKeyId: this.configService.getOrThrow<string>(
                'OBJECT_STORAGE_ACCESS_KEY_ID',
              ),
              secretAccessKey: this.configService.getOrThrow<string>(
                'OBJECT_STORAGE_SECRET_ACCESS_KEY',
              ),
            }
          : undefined,
      forcePathStyle:
        (this.configService.get<string>('OBJECT_STORAGE_FORCE_PATH_STYLE') ??
          'false') === 'true',
    });
  }

  async createImageAsset(dto: CreateImageAssetDto) {
    try {
      return await this.prisma.imageAsset.create({
        data: {
          storageProvider: dto.storageProvider,
          storageBucket: dto.storageBucket,
          storageKey: dto.storageKey,
          cdnUrl: dto.cdnUrl,
          mimeType: dto.mimeType,
          width: dto.width,
          height: dto.height,
          sizeBytes: dto.sizeBytes,
          checksumSha256: dto.checksumSha256,
          blurDataUrl: dto.blurDataUrl,
          altText: dto.altText,
          focalPointX: dto.focalPointX,
          focalPointY: dto.focalPointY,
          dominantColor: this.normalizeHexColor(dto.dominantColor),
          variants:
            dto.variants && dto.variants.length > 0
              ? {
                  create: dto.variants.map((variant) => ({
                    variantKey: variant.variantKey,
                    storageKey: variant.storageKey,
                    cdnUrl: variant.cdnUrl,
                    format: variant.format,
                    width: variant.width,
                    height: variant.height,
                    sizeBytes: variant.sizeBytes,
                  })),
                }
              : undefined,
        },
        include: {
          variants: {
            orderBy: { variantKey: 'asc' },
          },
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, ['storageKey'])) {
        throw new ConflictException({
          code: ErrorCodes.IMAGE_ASSET_DUPLICATE,
          message: 'An image asset already exists for this storageKey',
        });
      }
      throw error;
    }
  }

  async generateImageUploadUrl(dto: GenerateImageUploadUrlDto) {
    this.assertStorageConfigured();

    const normalizedMimeType = dto.mimeType.trim().toLowerCase();
    this.assertMimeTypeAllowed(normalizedMimeType);

    if (dto.sizeBytes > this.maxUploadBytes) {
      throw new BadRequestException({
        code: ErrorCodes.IMAGE_UPLOAD_SIZE_EXCEEDED,
        message: `Image size exceeds allowed limit of ${this.maxUploadBytes} bytes`,
      });
    }

    const fileExtension = this.resolveFileExtension(
      dto.fileName,
      normalizedMimeType,
    );
    const safeFolder = dto.targetFolder?.trim() || 'catalog';
    const objectKey = `images/${safeFolder}/${new Date().getUTCFullYear()}/${new Date().getUTCMonth() + 1}/${randomUUID()}${fileExtension}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.objectStorageBucket,
        Key: objectKey,
        ContentType: normalizedMimeType,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: this.presignedUploadExpiresSeconds,
      });

      return {
        storageKey: objectKey,
        uploadUrl,
        expiresInSeconds: this.presignedUploadExpiresSeconds,
        method: 'PUT',
        headers: {
          'Content-Type': normalizedMimeType,
        },
        cdnUrl: this.buildCdnUrl(objectKey),
      };
    } catch (error) {
      this.logger.error('Failed to generate presigned upload URL', error);
      throw new BadRequestException({
        code: ErrorCodes.IMAGE_UPLOAD_STORAGE_UNAVAILABLE,
        message: 'Unable to generate upload URL at the moment',
      });
    }
  }

  async finalizeImageUpload(dto: FinalizeImageUploadDto) {
    this.assertStorageConfigured();

    const storageKey = dto.storageKey.trim();
    let headResult;

    try {
      headResult = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.objectStorageBucket,
          Key: storageKey,
        }),
      );
    } catch {
      this.logger.warn(
        `Failed to verify object in storage for key ${storageKey}`,
      );
      throw new NotFoundException({
        code: ErrorCodes.IMAGE_UPLOAD_OBJECT_NOT_FOUND,
        message: 'Uploaded object not found in object storage',
      });
    }

    const mimeType = (headResult.ContentType || '').toLowerCase();
    this.assertMimeTypeAllowed(mimeType);

    const sizeBytes =
      typeof headResult.ContentLength === 'number'
        ? headResult.ContentLength
        : null;

    if (sizeBytes != null && sizeBytes > this.maxUploadBytes) {
      throw new BadRequestException({
        code: ErrorCodes.IMAGE_UPLOAD_SIZE_EXCEEDED,
        message: `Image size exceeds allowed limit of ${this.maxUploadBytes} bytes`,
      });
    }

    try {
      return await this.prisma.imageAsset.create({
        data: {
          storageProvider: this.objectStorageProvider,
          storageBucket: this.objectStorageBucket,
          storageKey,
          cdnUrl: this.buildCdnUrl(storageKey),
          mimeType: mimeType || null,
          sizeBytes,
          width: dto.width,
          height: dto.height,
          altText: dto.altText,
          focalPointX: dto.focalPointX,
          focalPointY: dto.focalPointY,
          dominantColor: this.normalizeHexColor(dto.dominantColor),
        },
        include: {
          variants: {
            orderBy: { variantKey: 'asc' },
          },
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, ['storageKey'])) {
        throw new ConflictException({
          code: ErrorCodes.IMAGE_ASSET_DUPLICATE,
          message: 'An image asset already exists for this storageKey',
        });
      }
      throw error;
    }
  }

  async cleanupOrphanImageAssetsCron(): Promise<
    | {
        deletedCount: number;
        deletedStorageObjects?: number;
        cutoffDate?: Date;
      }
    | undefined
  > {
    if (!this.orphanCleanupEnabled) {
      return;
    }

    return this.cleanupOrphanImageAssets();
  }

  async cleanupOrphanImageAssets() {
    this.assertStorageConfigured();

    const cutoffDate = new Date(
      Date.now() - this.orphanRetentionHours * 60 * 60 * 1000,
    );

    const orphanAssets = await this.prisma.imageAsset.findMany({
      where: {
        createdAt: { lt: cutoffDate },
        products: { none: {} },
        productCategories: { none: {} },
      },
      include: {
        variants: {
          select: {
            id: true,
            storageKey: true,
          },
        },
      },
      take: this.orphanCleanupBatchSize,
      orderBy: { createdAt: 'asc' },
    });

    if (orphanAssets.length === 0) {
      return {
        deletedCount: 0,
      };
    }

    let deletedStorageObjects = 0;
    for (const asset of orphanAssets) {
      const keysToDelete = [
        asset.storageKey,
        ...asset.variants.map((variant) => variant.storageKey),
      ];

      for (const key of keysToDelete) {
        try {
          await this.s3Client.send(
            new DeleteObjectCommand({
              Bucket: this.objectStorageBucket,
              Key: key,
            }),
          );
          deletedStorageObjects += 1;
        } catch {
          this.logger.warn(`Unable to delete orphan storage object: ${key}`);
        }
      }
    }

    const deleted = await this.prisma.imageAsset.deleteMany({
      where: {
        id: {
          in: orphanAssets.map((asset) => asset.id),
        },
      },
    });

    return {
      deletedCount: deleted.count,
      deletedStorageObjects,
      cutoffDate,
    };
  }

  // ── Categories ──────────────────────────────────────────────────────────

  async createCategory(dto: CreateProductCategoryDto) {
    if (dto.parentId) {
      await this.assertCategoryCanBeParent(dto.parentId);
    }
    if (dto.imageAssetId) {
      await this.assertImageAssetExists(dto.imageAssetId);
    }

    try {
      return await this.prisma.productCategory.create({
        data: {
          parentId: dto.parentId,
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          imageAssetId: dto.imageAssetId,
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
        parentId: true,
        name: true,
        slug: true,
        description: true,
        imageAsset: {
          select: {
            id: true,
            cdnUrl: true,
            blurDataUrl: true,
            altText: true,
            focalPointX: true,
            focalPointY: true,
            dominantColor: true,
            width: true,
            height: true,
            variants: {
              select: {
                variantKey: true,
                cdnUrl: true,
                width: true,
                height: true,
                format: true,
              },
              orderBy: { variantKey: 'asc' },
            },
          },
        },
      },
    });
  }

  async listAdminCategories() {
    return this.prisma.productCategory.findMany({
      orderBy: { name: 'asc' },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            products: true,
            productsAsSubCategory: true,
            children: true,
          },
        },
        imageAsset: {
          select: {
            id: true,
            cdnUrl: true,
            blurDataUrl: true,
            altText: true,
            focalPointX: true,
            focalPointY: true,
            dominantColor: true,
            width: true,
            height: true,
            variants: {
              select: {
                variantKey: true,
                cdnUrl: true,
                width: true,
                height: true,
                format: true,
              },
              orderBy: { variantKey: 'asc' },
            },
          },
        },
      },
    });
  }

  async updateCategory(categoryId: string, dto: UpdateProductCategoryDto) {
    await this.findCategoryOrFail(categoryId);

    if (dto.parentId !== undefined) {
      if (dto.parentId === categoryId) {
        throw new BadRequestException({
          code: ErrorCodes.PRODUCT_CATEGORY_INVALID_PARENT,
          message: 'Category cannot reference itself as parent',
        });
      }

      if (dto.parentId) {
        await this.assertCategoryCanBeParent(dto.parentId);
      }
    }

    if (dto.imageAssetId !== undefined && dto.imageAssetId !== null) {
      await this.assertImageAssetExists(dto.imageAssetId);
    }

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
    await this.assertCategoryIsRoot(dto.categoryId);
    if (dto.imageAssetId) {
      await this.assertImageAssetExists(dto.imageAssetId);
    }
    if (dto.subCategoryId) {
      await this.assertSubCategoryBelongsToCategory(
        dto.subCategoryId,
        dto.categoryId,
      );
    }
    try {
      return await this.prisma.product.create({
        data: {
          name: dto.name,
          subCategoryId: dto.subCategoryId,
          description: dto.description,
          saleUnit: dto.saleUnit,
          priceInCents: dto.priceInCents,
          categoryId: dto.categoryId,
          imageAssetId: dto.imageAssetId,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, ['name', 'categoryId'])) {
        throw new ConflictException({
          code: ErrorCodes.PRODUCT_DUPLICATE,
          message:
            'A catalog product with the same name already exists in this category',
        });
      }
      throw error;
    }
  }

  async createProductSubmission(userId: string, dto: CreateProductDto) {
    const profile = await this.resolveMerchantProfile(userId);
    await this.assertCategoryIsRoot(dto.categoryId);
    if (dto.imageAssetId) {
      await this.assertImageAssetExists(dto.imageAssetId);
    }
    if (dto.subCategoryId) {
      await this.assertSubCategoryBelongsToCategory(
        dto.subCategoryId,
        dto.categoryId,
      );
    }

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

    try {
      return await this.prisma.productSubmission.create({
        data: {
          merchantId: profile.id,
          name: dto.name,
          imageAssetId: dto.imageAssetId,
          subCategoryId: dto.subCategoryId,
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
          imageAsset: {
            select: {
              id: true,
              cdnUrl: true,
              altText: true,
              width: true,
              height: true,
            },
          },
          subCategory: {
            select: {
              id: true,
              name: true,
              slug: true,
              parentId: true,
            },
          },
        },
      });
    } catch (error) {
      if (
        this.isUniqueConstraintError(error, [
          'merchantId',
          'categoryId',
          'name',
          'status',
        ])
      ) {
        throw new ConflictException({
          code: ErrorCodes.PRODUCT_SUBMISSION_ALREADY_PENDING,
          message: 'A similar product submission is already pending review',
        });
      }
      throw error;
    }
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
          subCategory: {
            select: {
              id: true,
              name: true,
              slug: true,
              parentId: true,
            },
          },
          imageAsset: {
            select: {
              id: true,
              cdnUrl: true,
              altText: true,
              width: true,
              height: true,
            },
          },
          approvedProduct: {
            select: {
              id: true,
              name: true,
              subCategory: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  parentId: true,
                },
              },
              description: true,
              saleUnit: true,
              priceInCents: true,
              imageAsset: {
                select: {
                  id: true,
                  cdnUrl: true,
                  altText: true,
                  width: true,
                  height: true,
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
          subCategory: {
            select: {
              id: true,
              name: true,
              slug: true,
              parentId: true,
            },
          },
          reviewedByUser: {
            select: {
              id: true,
              email: true,
            },
          },
          imageAsset: {
            select: {
              id: true,
              cdnUrl: true,
              altText: true,
              width: true,
              height: true,
            },
          },
          approvedProduct: {
            select: {
              id: true,
              name: true,
              subCategory: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  parentId: true,
                },
              },
              description: true,
              saleUnit: true,
              priceInCents: true,
              isActive: true,
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
      subCategoryId?: string | null;
      description?: string;
      saleUnit?: SaleUnit;
      priceInCents?: number | null;
      categoryId?: string;
      imageAssetId?: string | null;
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
      await this.assertCategoryIsRoot(approvedProductOverrides.categoryId);
    }

    const effectiveCategoryId =
      approvedProductOverrides?.categoryId ?? submission.categoryId;
    const effectiveSubCategoryId =
      approvedProductOverrides?.subCategoryId === undefined
        ? submission.subCategoryId
        : approvedProductOverrides.subCategoryId;

    if (effectiveSubCategoryId) {
      await this.assertSubCategoryBelongsToCategory(
        effectiveSubCategoryId,
        effectiveCategoryId,
      );
    }

    if (
      status === ProductSubmissionStatus.APPROVED &&
      approvedProductOverrides?.imageAssetId
    ) {
      await this.assertImageAssetExists(approvedProductOverrides.imageAssetId);
    }

    if (status === ProductSubmissionStatus.APPROVED) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const product = await tx.product.create({
            data: {
              name: approvedProductOverrides?.name ?? submission.name,
              subCategoryId:
                approvedProductOverrides?.subCategoryId ??
                submission.subCategoryId,
              description:
                approvedProductOverrides?.description ?? submission.description,
              saleUnit:
                approvedProductOverrides?.saleUnit ?? submission.saleUnit,
              priceInCents:
                approvedProductOverrides?.priceInCents ??
                submission.priceInCents,
              categoryId:
                approvedProductOverrides?.categoryId ?? submission.categoryId,
              imageAssetId:
                approvedProductOverrides?.imageAssetId === undefined
                  ? submission.imageAssetId
                  : approvedProductOverrides.imageAssetId,
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
              subCategory: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  parentId: true,
                },
              },
              approvedProduct: {
                select: {
                  id: true,
                  name: true,
                  subCategory: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                      parentId: true,
                    },
                  },
                  isActive: true,
                },
              },
            },
          });
        });
      } catch (error) {
        if (this.isUniqueConstraintError(error, ['name', 'categoryId'])) {
          throw new ConflictException({
            code: ErrorCodes.PRODUCT_DUPLICATE,
            message:
              'A catalog product with the same name already exists in this category',
          });
        }
        throw error;
      }
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
        subCategory: {
          select: {
            id: true,
            name: true,
            slug: true,
            parentId: true,
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

    try {
      return await this.prisma.$transaction(async (tx) => {
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
            select: { id: true, parentId: true },
          });
          if (categories.length !== categoryIds.length) {
            throw new NotFoundException({
              code: ErrorCodes.PRODUCT_CATEGORY_NOT_FOUND,
              message: 'One or more product categories were not found',
            });
          }
          const nonRoot = categories.find(
            (category) => category.parentId !== null,
          );
          if (nonRoot) {
            throw new BadRequestException({
              code: ErrorCodes.PRODUCT_CATEGORY_MUST_BE_ROOT,
              message: 'Product category must be a root category',
            });
          }
        }

        const subCategoryIds = Array.from(
          new Set(
            dto.items
              .map((item) => item.subCategoryId)
              .filter((id): id is string => !!id),
          ),
        );

        const subCategoriesById = new Map<
          string,
          { id: string; parentId: string | null }
        >();
        if (subCategoryIds.length > 0) {
          const subCategories = await tx.productCategory.findMany({
            where: { id: { in: subCategoryIds } },
            select: { id: true, parentId: true },
          });
          if (subCategories.length !== subCategoryIds.length) {
            throw new NotFoundException({
              code: ErrorCodes.PRODUCT_SUB_CATEGORY_NOT_FOUND,
              message: 'One or more product sub-categories were not found',
            });
          }
          for (const subCategory of subCategories) {
            subCategoriesById.set(subCategory.id, subCategory);
          }
        }

        const imageAssetIds = Array.from(
          new Set(
            dto.items
              .map((item) => item.imageAssetId)
              .filter((id): id is string => !!id),
          ),
        );

        if (imageAssetIds.length > 0) {
          const imageAssets = await tx.imageAsset.findMany({
            where: { id: { in: imageAssetIds } },
            select: { id: true },
          });

          if (imageAssets.length !== imageAssetIds.length) {
            throw new NotFoundException({
              code: ErrorCodes.IMAGE_ASSET_NOT_FOUND,
              message: 'One or more image assets were not found',
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

          const effectiveCategoryId = item.categoryId ?? submission.categoryId;
          const effectiveSubCategoryId =
            item.subCategoryId === undefined
              ? submission.subCategoryId
              : item.subCategoryId;

          if (effectiveSubCategoryId) {
            const subCategory = subCategoriesById.get(effectiveSubCategoryId);
            if (!subCategory) {
              throw new NotFoundException({
                code: ErrorCodes.PRODUCT_SUB_CATEGORY_NOT_FOUND,
                message: 'Product sub-category not found',
              });
            }
            if (subCategory.parentId !== effectiveCategoryId) {
              throw new BadRequestException({
                code: ErrorCodes.PRODUCT_SUB_CATEGORY_CATEGORY_MISMATCH,
                message:
                  'Product sub-category does not belong to selected category',
              });
            }
          }

          const created = await tx.product.create({
            data: {
              name: item.name ?? submission.name,
              subCategoryId: item.subCategoryId ?? submission.subCategoryId,
              description: item.description ?? submission.description,
              saleUnit: item.saleUnit ?? submission.saleUnit,
              priceInCents: item.priceInCents ?? submission.priceInCents,
              categoryId: item.categoryId ?? submission.categoryId,
              imageAssetId:
                item.imageAssetId === undefined
                  ? submission.imageAssetId
                  : item.imageAssetId,
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
    } catch (error) {
      if (this.isUniqueConstraintError(error, ['name', 'categoryId'])) {
        throw new ConflictException({
          code: ErrorCodes.PRODUCT_DUPLICATE,
          message:
            'A catalog product with the same name already exists in this category',
        });
      }
      throw error;
    }
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
          subCategory: {
            select: {
              id: true,
              name: true,
              slug: true,
              parentId: true,
            },
          },
          description: true,
          saleUnit: true,
          priceInCents: true,
          imageAsset: {
            select: {
              id: true,
              cdnUrl: true,
              blurDataUrl: true,
              altText: true,
              focalPointX: true,
              focalPointY: true,
              dominantColor: true,
              width: true,
              height: true,
              variants: {
                select: {
                  variantKey: true,
                  cdnUrl: true,
                  width: true,
                  height: true,
                  format: true,
                },
                orderBy: { variantKey: 'asc' },
              },
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              imageAsset: {
                select: {
                  id: true,
                  cdnUrl: true,
                  blurDataUrl: true,
                  altText: true,
                  focalPointX: true,
                  focalPointY: true,
                  dominantColor: true,
                  width: true,
                  height: true,
                },
              },
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
        subCategory: {
          select: {
            id: true,
            name: true,
            slug: true,
            parentId: true,
          },
        },
        saleUnit: true,
        priceInCents: true,
        imageAsset: {
          select: {
            id: true,
            cdnUrl: true,
            blurDataUrl: true,
            altText: true,
            focalPointX: true,
            focalPointY: true,
            dominantColor: true,
            width: true,
            height: true,
            variants: {
              select: {
                variantKey: true,
                cdnUrl: true,
                width: true,
                height: true,
                format: true,
              },
              orderBy: { variantKey: 'asc' },
            },
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            imageAsset: {
              select: {
                id: true,
                cdnUrl: true,
                blurDataUrl: true,
                altText: true,
                focalPointX: true,
                focalPointY: true,
                dominantColor: true,
                width: true,
                height: true,
              },
            },
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
        subCategory: {
          select: {
            id: true,
            name: true,
            slug: true,
            parentId: true,
          },
        },
        saleUnit: true,
        priceInCents: true,
        imageAsset: {
          select: {
            id: true,
            cdnUrl: true,
            blurDataUrl: true,
            altText: true,
            focalPointX: true,
            focalPointY: true,
            dominantColor: true,
            width: true,
            height: true,
            variants: {
              select: {
                variantKey: true,
                cdnUrl: true,
                width: true,
                height: true,
                format: true,
              },
              orderBy: { variantKey: 'asc' },
            },
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            imageAsset: {
              select: {
                id: true,
                cdnUrl: true,
                blurDataUrl: true,
                altText: true,
                focalPointX: true,
                focalPointY: true,
                dominantColor: true,
                width: true,
                height: true,
              },
            },
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
      subCategory: p.subCategory,
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
      await this.assertCategoryIsRoot(dto.categoryId);
    }

    const effectiveSubCategoryId =
      dto.subCategoryId === undefined
        ? submission.subCategoryId
        : dto.subCategoryId;
    if (effectiveSubCategoryId) {
      await this.assertSubCategoryBelongsToCategory(
        effectiveSubCategoryId,
        categoryId,
      );
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

    try {
      return await this.prisma.productSubmission.update({
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
          subCategory: {
            select: {
              id: true,
              name: true,
              slug: true,
              parentId: true,
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
    } catch (error) {
      if (
        this.isUniqueConstraintError(error, [
          'merchantId',
          'categoryId',
          'name',
          'status',
        ])
      ) {
        throw new ConflictException({
          code: ErrorCodes.PRODUCT_SUBMISSION_ALREADY_PENDING,
          message: 'A similar product submission is already pending review',
        });
      }
      throw error;
    }
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
    const product = await this.findProductOrFailAdmin(productId);
    if (dto.categoryId) {
      await this.assertCategoryIsRoot(dto.categoryId);
    }
    if (dto.imageAssetId !== undefined && dto.imageAssetId !== null) {
      await this.assertImageAssetExists(dto.imageAssetId);
    }

    const effectiveCategoryId = dto.categoryId ?? product.categoryId;
    const effectiveSubCategoryId =
      dto.subCategoryId === undefined
        ? product.subCategoryId
        : dto.subCategoryId;

    if (effectiveSubCategoryId) {
      await this.assertSubCategoryBelongsToCategory(
        effectiveSubCategoryId,
        effectiveCategoryId,
      );
    }
    try {
      return await this.prisma.product.update({
        where: { id: productId },
        data: dto,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, ['name', 'categoryId'])) {
        throw new ConflictException({
          code: ErrorCodes.PRODUCT_DUPLICATE,
          message:
            'A catalog product with the same name already exists in this category',
        });
      }
      throw error;
    }
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

    const effectiveMin = dto.minOrderQty ?? 1;
    if (dto.maxOrderQty != null && dto.maxOrderQty < effectiveMin) {
      throw new BadRequestException({
        code: ErrorCodes.OFFER_MAX_QTY_BELOW_MIN,
        message: 'maxOrderQty must be >= minOrderQty',
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
          maxOrderQty: dto.maxOrderQty ?? null,
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              subCategory: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  parentId: true,
                },
              },
              description: true,
              saleUnit: true,
              priceInCents: true,
              imageAsset: {
                select: {
                  id: true,
                  cdnUrl: true,
                  altText: true,
                  width: true,
                  height: true,
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
          subCategory: {
            select: {
              id: true,
              name: true,
              slug: true,
              parentId: true,
            },
          },
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

      const effectiveMin = offer.minOrderQty ?? 1;
      if (offer.maxOrderQty != null && offer.maxOrderQty < effectiveMin) {
        throw new BadRequestException({
          code: ErrorCodes.OFFER_MAX_QTY_BELOW_MIN,
          message: `maxOrderQty must be >= minOrderQty for product ${offer.productId}`,
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
            maxOrderQty: offer.maxOrderQty ?? null,
          },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                subCategory: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    parentId: true,
                  },
                },
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
              subCategory: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  parentId: true,
                },
              },
              description: true,
              saleUnit: true,
              priceInCents: true,
              imageAsset: {
                select: {
                  id: true,
                  cdnUrl: true,
                  altText: true,
                  width: true,
                  height: true,
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

    if (dto.maxOrderQty != null) {
      const effectiveMin =
        dto.minOrderQty != null
          ? dto.minOrderQty
          : Number(existingOffer.minOrderQty);
      if (dto.maxOrderQty < effectiveMin) {
        throw new BadRequestException({
          code: ErrorCodes.OFFER_MAX_QTY_BELOW_MIN,
          message: 'maxOrderQty must be >= minOrderQty',
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
              imageAsset: {
                select: {
                  id: true,
                  cdnUrl: true,
                  altText: true,
                  width: true,
                  height: true,
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
              subCategory: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  parentId: true,
                },
              },
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
    limit = 24,
    cursor?: string,
    query?: string,
  ) {
    const profile = await this.findActiveMerchantProfileBySlug(merchantSlug);

    const safeLimit =
      Number.isInteger(limit) && limit > 0 ? Math.min(limit, 48) : 24;

    const where = this.buildPublicMerchantOffersWhere(profile.id);

    const normalizedQuery = query?.trim().toLowerCase() ?? '';

    if (!normalizedQuery) {
      const offers = await this.prisma.storeOffer.findMany({
        where,
        orderBy: { id: 'asc' },
        take: safeLimit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          product: {
            select: {
              id: true,
              name: true,
              subCategory: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  parentId: true,
                },
              },
              description: true,
              saleUnit: true,
              priceInCents: true,
              imageAsset: {
                select: {
                  id: true,
                  cdnUrl: true,
                  altText: true,
                  width: true,
                  height: true,
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
          },
        },
      });

      const hasMore = offers.length > safeLimit;
      const pageData = hasMore ? offers.slice(0, safeLimit) : offers;
      const nextCursor =
        hasMore && pageData.length > 0
          ? pageData[pageData.length - 1].id
          : null;

      return {
        data: pageData.map((offer) => ({
          ...offer,
          defaultPriceInCents: offer.product.priceInCents,
          overridePriceInCents: offer.priceInCents,
          effectivePriceInCents:
            offer.priceInCents ?? offer.product.priceInCents,
          isOverridden: offer.priceInCents != null,
        })),
        nextCursor,
        hasMore,
      };
    }

    const offers = await this.prisma.storeOffer.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            subCategory: {
              select: {
                id: true,
                name: true,
                slug: true,
                parentId: true,
              },
            },
            description: true,
            saleUnit: true,
            priceInCents: true,
            imageAsset: {
              select: {
                id: true,
                cdnUrl: true,
                altText: true,
                width: true,
                height: true,
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
        },
      },
    });

    const MIN_SIMILARITY_THRESHOLD = 0.12;
    const scored = offers
      .map((offer) => {
        const productNameLower = offer.product.name.toLowerCase();
        const isStrictMatch = productNameLower.includes(normalizedQuery);
        const similarityScore = this.calculateSimilarity(
          normalizedQuery,
          productNameLower,
        );

        return {
          ...offer,
          isStrictMatch,
          similarityScore,
        };
      })
      .filter(
        (offer) =>
          offer.isStrictMatch ||
          offer.similarityScore >= MIN_SIMILARITY_THRESHOLD,
      )
      .sort((a, b) => {
        if (a.isStrictMatch !== b.isStrictMatch) {
          return a.isStrictMatch ? -1 : 1;
        }
        if (b.similarityScore !== a.similarityScore) {
          return b.similarityScore - a.similarityScore;
        }
        return a.product.name.localeCompare(b.product.name);
      });

    const startIndex = cursor
      ? Math.max(scored.findIndex((offer) => offer.id === cursor) + 1, 0)
      : 0;
    const pageData = scored.slice(startIndex, startIndex + safeLimit + 1);
    const hasMore = pageData.length > safeLimit;
    const visibleData = hasMore ? pageData.slice(0, safeLimit) : pageData;
    const nextCursor =
      hasMore && visibleData.length > 0
        ? visibleData[visibleData.length - 1].id
        : null;

    return {
      data: visibleData.map((offer) => ({
        ...offer,
        defaultPriceInCents: offer.product.priceInCents,
        overridePriceInCents: offer.priceInCents,
        effectivePriceInCents: offer.priceInCents ?? offer.product.priceInCents,
        isOverridden: offer.priceInCents != null,
      })),
      nextCursor,
      hasMore,
    };
  }

  async listPublicRootCategoriesForMerchant(merchantSlug: string) {
    const profile = await this.findActiveMerchantProfileBySlug(merchantSlug);

    const offers = await this.prisma.storeOffer.findMany({
      where: this.buildPublicMerchantOffersWhere(profile.id),
      select: {
        product: {
          select: {
            category: {
              select: {
                id: true,
                parentId: true,
                name: true,
                slug: true,
                description: true,
                imageAsset: {
                  select: {
                    id: true,
                    cdnUrl: true,
                    blurDataUrl: true,
                    altText: true,
                    focalPointX: true,
                    focalPointY: true,
                    dominantColor: true,
                    width: true,
                    height: true,
                    variants: {
                      select: {
                        variantKey: true,
                        cdnUrl: true,
                        width: true,
                        height: true,
                        format: true,
                      },
                      orderBy: { variantKey: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        product: {
          category: {
            name: 'asc',
          },
        },
      },
    });

    const categoriesById = new Map<
      string,
      (typeof offers)[number]['product']['category']
    >();
    for (const offer of offers) {
      const category = offer.product.category;
      if (!category.parentId && !categoriesById.has(category.id)) {
        categoriesById.set(category.id, category);
      }
    }

    return Array.from(categoriesById.values());
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private assertMimeTypeAllowed(mimeType: string): void {
    if (!mimeType || !this.allowedMimeTypes.has(mimeType.toLowerCase())) {
      throw new BadRequestException({
        code: ErrorCodes.IMAGE_UPLOAD_INVALID_MIME,
        message: `Unsupported image mime type: ${mimeType || 'unknown'}`,
      });
    }
  }

  private assertStorageConfigured(): void {
    if (!this.objectStorageBucket || !this.objectStorageCdnBaseUrl) {
      throw new BadRequestException({
        code: ErrorCodes.IMAGE_UPLOAD_STORAGE_UNAVAILABLE,
        message:
          'Object storage is not configured. Set OBJECT_STORAGE_BUCKET and OBJECT_STORAGE_CDN_BASE_URL',
      });
    }
  }

  private resolveFileExtension(fileName: string, mimeType: string): string {
    const fromName = extname(fileName.trim()).toLowerCase();
    if (fromName) {
      return fromName;
    }

    const fallbackByMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/avif': '.avif',
    };

    return fallbackByMime[mimeType] ?? '.bin';
  }

  private buildCdnUrl(storageKey: string): string {
    return `${this.objectStorageCdnBaseUrl}/${storageKey}`;
  }

  private normalizeBaseUrl(value: string): string {
    return value.replace(/\/+$/, '');
  }

  private normalizeHexColor(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = value.startsWith('#') ? value : `#${value}`;
    return normalized.toUpperCase();
  }

  private isUniqueConstraintError(error: unknown, fields?: string[]) {
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
    ) {
      return false;
    }

    if (!fields || fields.length === 0) {
      return true;
    }

    const target = error.meta?.target;
    if (!Array.isArray(target)) {
      return true;
    }

    return fields.every((field) => target.includes(field));
  }

  private async findActiveMerchantProfileBySlug(merchantSlug: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { slug: merchantSlug },
    });

    if (
      !profile ||
      !profile.isActive ||
      profile.status !== MerchantProfileStatus.APPROVED
    ) {
      throw new NotFoundException({
        code: ErrorCodes.MERCHANT_NOT_FOUND,
        message: 'Merchant not found',
      });
    }

    return profile;
  }

  private buildPublicMerchantOffersWhere(
    merchantId: string,
  ): Prisma.StoreOfferWhereInput {
    return {
      merchantId,
      isActive: true,
      product: {
        isActive: true,
      },
      OR: [
        { priceInCents: { not: null } },
        { product: { priceInCents: { not: null } } },
      ],
    };
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
    if (profile.status !== MerchantProfileStatus.APPROVED)
      throw new ForbiddenException({
        code: ErrorCodes.MERCHANT_PROFILE_NOT_APPROVED,
        message: 'Merchant profile is not approved yet',
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

  private async assertCategoryCanBeParent(parentCategoryId: string) {
    const parent = await this.findCategoryOrFail(parentCategoryId);
    if (parent.parentId !== null) {
      throw new BadRequestException({
        code: ErrorCodes.PRODUCT_CATEGORY_PARENT_MUST_BE_ROOT,
        message: 'Parent category must be a root category',
      });
    }
    return parent;
  }

  private async assertCategoryIsRoot(categoryId: string) {
    const category = await this.findCategoryOrFail(categoryId);
    if (category.parentId !== null) {
      throw new BadRequestException({
        code: ErrorCodes.PRODUCT_CATEGORY_MUST_BE_ROOT,
        message: 'Product category must be a root category',
      });
    }
    return category;
  }

  private async findSubCategoryOrFail(subCategoryId: string) {
    const subCategory = await this.prisma.productCategory.findUnique({
      where: { id: subCategoryId },
      select: {
        id: true,
        parentId: true,
      },
    });

    if (!subCategory) {
      throw new NotFoundException({
        code: ErrorCodes.PRODUCT_SUB_CATEGORY_NOT_FOUND,
        message: 'Product sub-category not found',
      });
    }

    return subCategory;
  }

  private async assertSubCategoryBelongsToCategory(
    subCategoryId: string,
    categoryId: string,
  ) {
    const subCategory = await this.findSubCategoryOrFail(subCategoryId);
    if (subCategory.parentId !== categoryId) {
      throw new BadRequestException({
        code: ErrorCodes.PRODUCT_SUB_CATEGORY_CATEGORY_MISMATCH,
        message: 'Product sub-category does not belong to selected category',
      });
    }
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

  private async assertImageAssetExists(imageAssetId: string) {
    const imageAsset = await this.prisma.imageAsset.findUnique({
      where: { id: imageAssetId },
      select: { id: true },
    });

    if (!imageAsset) {
      throw new NotFoundException({
        code: ErrorCodes.IMAGE_ASSET_NOT_FOUND,
        message: 'Image asset not found',
      });
    }
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
