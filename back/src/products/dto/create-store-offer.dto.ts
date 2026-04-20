import {
  IsInt,
  IsNumber,
  IsString,
  Max,
  Min,
  IsOptional,
} from 'class-validator';

export class CreateStoreOfferDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(0)
  priceInCents: number;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(99999)
  minOrderQty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(99999)
  stepQty?: number;
}
