import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PickupSlotsService } from './pickup-slots.service';

@Injectable()
export class PickupSlotsScheduler {
  private readonly logger = new Logger(PickupSlotsScheduler.name);
  private readonly generationCronEnabled: boolean;
  private readonly cleanupCronEnabled: boolean;

  constructor(
    private readonly pickupSlotsService: PickupSlotsService,
    private readonly configService: ConfigService,
  ) {
    this.generationCronEnabled = this.resolveCronEnabled(
      'PICKUP_SLOTS_GENERATION_CRON_ENABLED',
    );
    this.cleanupCronEnabled = this.resolveCronEnabled(
      'PICKUP_SLOTS_CLEANUP_CRON_ENABLED',
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async generateDailySlidingWindow() {
    if (!this.generationCronEnabled) {
      this.logger.debug('Pickup slot generation cron skipped');
      return;
    }

    const result =
      await this.pickupSlotsService.generateFutureSlotsForAllActiveMerchants(7);

    this.logger.log(
      `Generated slots for ${result.processedMerchants} merchants (created=${result.createdCount}, deleted=${result.deletedCount})`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldSlots() {
    if (!this.cleanupCronEnabled) {
      this.logger.debug('Pickup slot cleanup cron skipped');
      return;
    }

    const result = await this.pickupSlotsService.cleanupOldUnreferencedSlots();
    this.logger.log(`Cleanup removed ${result.deletedCount} old slots`);
  }

  private resolveCronEnabled(configKey: string): boolean {
    const configuredValue = this.configService.get<string>(configKey);

    if (configuredValue != null) {
      return configuredValue.toLowerCase() === 'true';
    }

    return this.configService.get<string>('NODE_ENV') === 'production';
  }
}
