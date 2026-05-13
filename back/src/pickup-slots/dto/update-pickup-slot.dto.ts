import { IsDateString, IsOptional } from 'class-validator';

export class UpdatePickupSlotDto {
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
