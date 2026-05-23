import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProductCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  imageAssetId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
