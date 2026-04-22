import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PickupSlotsService } from './pickup-slots.service';

@Injectable()
export class PickupSlotsScheduler {
  private readonly logger = new Logger(PickupSlotsScheduler.name);

  constructor(private readonly pickupSlotsService: PickupSlotsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async generateDailySlidingWindow() {
    const result =
      await this.pickupSlotsService.generateFutureSlotsForAllActiveMerchants(7);

    this.logger.log(
      `Generated slots for ${result.processedMerchants} merchants (created=${result.createdCount}, deleted=${result.deletedCount})`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldSlots() {
    const result = await this.pickupSlotsService.cleanupOldUnreferencedSlots();
    this.logger.log(`Cleanup removed ${result.deletedCount} old slots`);
  }
}
