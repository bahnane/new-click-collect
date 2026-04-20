import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateStoreOfferDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  priceInCents?: number | null;

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
