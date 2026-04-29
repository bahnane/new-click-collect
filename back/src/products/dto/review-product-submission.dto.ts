import { ProductSubmissionStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
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
}
