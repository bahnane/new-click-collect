import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProductCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  parentId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  imageAssetId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  description?: string;
}
