import {
  IsInt,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SaleUnit } from '@prisma/client';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  imageAssetId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  subCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(SaleUnit)
  saleUnit: SaleUnit;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceInCents?: number;

  @IsString()
  @MinLength(1)
  categoryId: string;
}
