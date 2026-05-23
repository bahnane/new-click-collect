import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsScheduler } from './products.scheduler';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductsScheduler],
  exports: [ProductsService],
})
export class ProductsModule {}
