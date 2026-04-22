import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Weekday } from '@prisma/client';

@ValidatorConstraint({ name: 'hourStep', async: false })
class HourStepConstraint implements ValidatorConstraintInterface {
  validate(value: number, args?: ValidationArguments) {
    if (!Number.isInteger(value)) {
      return false;
    }

    const step = Number(args?.constraints[0] ?? 1);
    return value % step === 0;
  }

  defaultMessage(args?: ValidationArguments) {
    return `hour must be a multiple of ${args?.constraints[0] ?? 1}`;
  }
}

@ValidatorConstraint({ name: 'hourRange', async: false })
class HourRangeConstraint implements ValidatorConstraintInterface {
  validate(endHour: number, args?: ValidationArguments) {
    const startHour = (args?.object as { startHour?: number } | undefined)
      ?.startHour;
    return Number.isInteger(startHour) && Number.isInteger(endHour)
      ? endHour > startHour
      : false;
  }

  defaultMessage() {
    return 'endHour must be greater than startHour';
  }
}

export class MerchantOpeningHourDto {
  @IsEnum(Weekday)
  dayOfWeek: Weekday;

  @IsInt()
  @Min(0)
  @Max(23)
  startHour: number;

  @IsInt()
  @Min(1)
  @Max(24)
  @Validate(HourRangeConstraint)
  endHour: number;
}

export class MerchantPickupHourDto {
  @IsEnum(Weekday)
  dayOfWeek: Weekday;

  @IsInt()
  @Min(0)
  @Max(22)
  @Validate(HourStepConstraint, [2])
  startHour: number;

  @IsInt()
  @Min(2)
  @Max(24)
  @Validate(HourStepConstraint, [2])
  @Validate(HourRangeConstraint)
  endHour: number;
}

export class MerchantOpeningHoursFieldDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique((entry: MerchantOpeningHourDto) => entry.dayOfWeek)
  @ValidateNested({ each: true })
  @Type(() => MerchantOpeningHourDto)
  openingHours?: MerchantOpeningHourDto[];
}

export class MerchantPickupHoursFieldDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((entry: MerchantPickupHourDto) => entry.dayOfWeek)
  @ValidateNested({ each: true })
  @Type(() => MerchantPickupHourDto)
  pickupHours: MerchantPickupHourDto[];
}
