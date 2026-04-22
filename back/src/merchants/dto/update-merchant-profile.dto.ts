import {
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MerchantOpeningHourDto,
  MerchantPickupHourDto,
} from './merchant-weekly-hours.dto';

export class UpdateMerchantProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  storeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  zipCode?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique((entry: MerchantOpeningHourDto) => entry.dayOfWeek)
  @ValidateNested({ each: true })
  @Type(() => MerchantOpeningHourDto)
  openingHours?: MerchantOpeningHourDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((entry: MerchantPickupHourDto) => entry.dayOfWeek)
  @ValidateNested({ each: true })
  @Type(() => MerchantPickupHourDto)
  pickupHours?: MerchantPickupHourDto[];
}

export class UpdateMerchantStatusDto {
  @IsBoolean()
  isActive: boolean;
}
