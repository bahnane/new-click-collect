import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreatePickupSlotDto {
  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxOrders?: number;
}
