import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateImageAssetVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  variantKey: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  storageKey: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  cdnUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  format?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  height?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes?: number;
}

export class CreateImageAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  storageProvider: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  storageBucket?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  storageKey: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  cdnUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  height?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  checksumSha256?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  focalPointX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  focalPointY?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^#?[0-9A-Fa-f]{6}$/, {
    message: 'dominantColor must be a 6-digit hex color',
  })
  dominantColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  blurDataUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateImageAssetVariantDto)
  variants?: CreateImageAssetVariantDto[];
}
