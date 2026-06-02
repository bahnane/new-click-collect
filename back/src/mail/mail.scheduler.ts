import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailService } from './mail.service';

@Injectable()
export class MailScheduler {
  private readonly logger = new Logger(MailScheduler.name);
  private readonly deliveryCronEnabled: boolean;

  constructor(
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    this.deliveryCronEnabled =
      (this.configService.get<string>('MAIL_DELIVERY_CRON_ENABLED') ??
        'true') === 'true';
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingMailDeliveries() {
    if (!this.deliveryCronEnabled) {
      this.logger.debug('Mail delivery cron skipped');
      return;
    }

    const result = await this.mailService.processPendingDeliveries();
    if (result.processed === 0) {
      return;
    }

    this.logger.log(
      `Processed ${result.processed} queued emails (sent=${result.sent}, rescheduled=${result.rescheduled}, failed=${result.failed}, skipped=${result.skipped})`,
    );
  }
}
