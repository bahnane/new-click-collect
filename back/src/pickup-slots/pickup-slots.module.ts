import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PickupSlotsController } from './pickup-slots.controller';
import { PickupSlotsScheduler } from './pickup-slots.scheduler';
import { PickupSlotsService } from './pickup-slots.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PickupSlotsController],
  providers: [PickupSlotsService, PickupSlotsScheduler],
  exports: [PickupSlotsService],
})
export class PickupSlotsModule {}
