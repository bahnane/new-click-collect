import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCodes } from '../common/errors/api-error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessTypeDto } from './dto/create-business-type.dto';
import { UpdateBusinessTypeDto } from './dto/update-business-type.dto';

@Injectable()
export class BusinessTypesService {
  constructor(private readonly prisma: PrismaService) {}

  listActive() {
    return this.prisma.businessType.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true },
    });
  }

  listAdmin() {
    return this.prisma.businessType.findMany({
      orderBy: { code: 'asc' },
      include: {
        categories: {
          select: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
        _count: { select: { merchants: true } },
      },
    });
  }

  async create(dto: CreateBusinessTypeDto) {
    await this.assertRootCategories(dto.categoryIds ?? []);
    try {
      return await this.prisma.businessType.create({
        data: {
          code: dto.code,
          categories: {
            create: (dto.categoryIds ?? []).map((categoryId) => ({
              categoryId,
            })),
          },
        },
        include: { categories: { select: { categoryId: true } } },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, ['code'])) {
        throw new ConflictException({
          code: ErrorCodes.BUSINESS_TYPE_DUPLICATE,
          message: 'Business type code already exists',
        });
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateBusinessTypeDto) {
    await this.findOrFail(id);
    if (dto.categoryIds !== undefined) {
      await this.assertRootCategories(dto.categoryIds);
    }
    try {
      return await this.prisma.businessType.update({
        where: { id },
        data: {
          code: dto.code,
          isActive: dto.isActive,
          ...(dto.categoryIds !== undefined
            ? {
                categories: {
                  deleteMany: {},
                  create: dto.categoryIds.map((categoryId) => ({ categoryId })),
                },
              }
            : {}),
        },
        include: { categories: { select: { categoryId: true } } },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, ['code'])) {
        throw new ConflictException({
          code: ErrorCodes.BUSINESS_TYPE_DUPLICATE,
          message: 'Business type code already exists',
        });
      }
      throw error;
    }
  }

  private async findOrFail(id: string) {
    const businessType = await this.prisma.businessType.findUnique({
      where: { id },
    });
    if (!businessType) {
      throw new NotFoundException({
        code: ErrorCodes.BUSINESS_TYPE_NOT_FOUND,
        message: 'Business type not found',
      });
    }
    return businessType;
  }

  private async assertRootCategories(categoryIds: string[]) {
    if (categoryIds.length === 0) return;
    const categories = await this.prisma.productCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, parentId: true },
    });
    if (categories.length !== categoryIds.length) {
      throw new NotFoundException({
        code: ErrorCodes.PRODUCT_CATEGORY_NOT_FOUND,
        message: 'Product category not found',
      });
    }
    if (categories.some((category) => category.parentId !== null)) {
      throw new BadRequestException({
        code: ErrorCodes.PRODUCT_CATEGORY_MUST_BE_ROOT,
        message: 'Only root categories can be assigned to a business type',
      });
    }
  }

  private isUniqueConstraintError(error: unknown, fields: string[]): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      fields.every((field) => error.meta?.target?.toString().includes(field))
    );
  }
}
