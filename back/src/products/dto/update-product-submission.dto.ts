import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SaleUnit } from '@prisma/client';

export class UpdateProductSubmissionDto {
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
  priceInCents?: number | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  categoryId?: string;
}
