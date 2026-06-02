import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailScheduler } from './mail.scheduler';
import { MailService } from './mail.service';

@Module({
  imports: [ConfigModule],
  providers: [MailService, MailScheduler],
  exports: [MailService],
})
export class MailModule {}
