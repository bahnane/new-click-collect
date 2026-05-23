import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class GenerateImageUploadUrlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fileName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  mimeType: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  targetFolder?: string;
}
