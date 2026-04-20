import { IsNumber, IsString, Max, Min } from 'class-validator';

export class UpsertCartItemDto {
  @IsString()
  storeOfferId: string;

  @IsNumber()
  @Min(0.001)
  @Max(99999)
  quantity: number;
}
