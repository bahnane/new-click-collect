import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProductsService } from './products.service';

@Injectable()
export class ProductsScheduler {
  private readonly logger = new Logger(ProductsScheduler.name);

  constructor(private readonly productsService: ProductsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOrphanImageAssets() {
    const result = await this.productsService.cleanupOrphanImageAssetsCron();

    if (!result) {
      this.logger.debug('Image orphan cleanup skipped');
      return;
    }

    this.logger.log(
      `Image orphan cleanup deleted ${result.deletedCount} assets and ${result.deletedStorageObjects ?? 0} storage objects`,
    );
  }
}
