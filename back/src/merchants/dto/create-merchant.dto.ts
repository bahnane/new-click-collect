import {
  IsNumber,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BusinessType } from '@prisma/client';
import {
  MerchantOpeningHourDto,
  MerchantPickupHourDto,
} from './merchant-weekly-hours.dto';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  ValidateNested,
} from 'class-validator';

export class CreateMerchantDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  storeName: string;

  @IsEnum(BusinessType)
  businessType: BusinessType;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique((entry: MerchantOpeningHourDto) => entry.dayOfWeek)
  @ValidateNested({ each: true })
  @Type(() => MerchantOpeningHourDto)
  openingHours?: MerchantOpeningHourDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((entry: MerchantPickupHourDto) => entry.dayOfWeek)
  @ValidateNested({ each: true })
  @Type(() => MerchantPickupHourDto)
  pickupHours: MerchantPickupHourDto[];
}
