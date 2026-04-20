import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CheckoutOrderDto {
  @IsString()
  pickupSlotId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
