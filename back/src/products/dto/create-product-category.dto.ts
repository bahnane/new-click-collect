import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProductCategoryDto {
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
