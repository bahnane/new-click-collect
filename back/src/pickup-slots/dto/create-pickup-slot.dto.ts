import { IsDateString } from 'class-validator';

export class CreatePickupSlotDto {
  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;
}
