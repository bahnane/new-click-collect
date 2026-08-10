import { Module } from '@nestjs/common';
import { AddressSearchController } from './address-search.controller';

@Module({
  controllers: [AddressSearchController],
})
export class AddressSearchModule {}
