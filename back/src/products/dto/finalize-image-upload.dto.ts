import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class FinalizeImageUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  storageKey: string;

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
}
