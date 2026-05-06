import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateStoreOfferDto } from './create-store-offer.dto';

export class CreateStoreOffersBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStoreOfferDto)
  offers: CreateStoreOfferDto[];
}
