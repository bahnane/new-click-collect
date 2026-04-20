import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdatePickupSlotDto {
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxOrders?: number;
}
