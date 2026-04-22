import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PickupSlotsModule } from '../pickup-slots/pickup-slots.module';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';

@Module({
  imports: [MailModule, PickupSlotsModule],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
