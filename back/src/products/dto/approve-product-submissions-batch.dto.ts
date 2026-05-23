import { SaleUnit } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ApproveProductSubmissionBatchItemDto {
  @IsString()
  @MinLength(1)
  id: string;

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

export class ApproveProductSubmissionsBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApproveProductSubmissionBatchItemDto)
  items: ApproveProductSubmissionBatchItemDto[];
}
