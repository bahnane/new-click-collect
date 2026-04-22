import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PickupSlotsController } from './pickup-slots.controller';
import { PickupSlotsScheduler } from './pickup-slots.scheduler';
import { PickupSlotsService } from './pickup-slots.service';

@Module({
  imports: [PrismaModule],
  controllers: [PickupSlotsController],
  providers: [PickupSlotsService, PickupSlotsScheduler],
  exports: [PickupSlotsService],
})
export class PickupSlotsModule {}
