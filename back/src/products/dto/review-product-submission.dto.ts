import { ProductSubmissionStatus, SaleUnit } from '@prisma/client';
import {
  IsInt,
  IsEnum,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ReviewProductSubmissionDto {
  @IsEnum(ProductSubmissionStatus)
  status: ProductSubmissionStatus;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  subCategoryId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(SaleUnit)
  saleUnit?: SaleUnit;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000000)
  priceInCents?: number | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  imageAssetId?: string | null;
}
