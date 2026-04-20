import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PickupSlotsController } from './pickup-slots.controller';
import { PickupSlotsService } from './pickup-slots.service';

@Module({
  imports: [PrismaModule],
  controllers: [PickupSlotsController],
  providers: [PickupSlotsService],
})
export class PickupSlotsModule {}
