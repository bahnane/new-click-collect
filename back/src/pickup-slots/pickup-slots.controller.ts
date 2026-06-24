import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApprovedMerchantGuard } from '../auth/guards/approved-merchant.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { ErrorCodes } from '../common/errors/api-error-codes';
import { CreatePickupSlotDto } from './dto/create-pickup-slot.dto';
import { UpdatePickupSlotDto } from './dto/update-pickup-slot.dto';
import { PickupSlotsService } from './pickup-slots.service';

@Controller()
export class PickupSlotsController {
  constructor(private readonly pickupSlotsService: PickupSlotsService) {}

  @Get('merchants/:merchantId/pickup-slots')
  listPublicMerchantSlots(@Param('merchantId') merchantId: string) {
    return this.pickupSlotsService.listPublicMerchantSlots(merchantId);
  }

  @UseGuards(JwtAuthGuard, ApprovedMerchantGuard)
  @Get('merchants/me/pickup-slots')
  listMySlots(@CurrentUser() user: JwtPayload) {
    this.assertMerchant(user);
    return this.pickupSlotsService.listMySlots(user.sub);
  }

  @UseGuards(JwtAuthGuard, ApprovedMerchantGuard)
  @Post('merchants/me/pickup-slots')
  createMySlot(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePickupSlotDto,
  ) {
    this.assertMerchant(user);
    return this.pickupSlotsService.createMySlot(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, ApprovedMerchantGuard)
  @Patch('merchants/me/pickup-slots/:id')
  updateMySlot(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePickupSlotDto,
  ) {
    this.assertMerchant(user);
    return this.pickupSlotsService.updateMySlot(user.sub, id, dto);
  }

  @UseGuards(JwtAuthGuard, ApprovedMerchantGuard)
  @Patch('merchants/me/pickup-slots/:id/toggle')
  toggleMySlot(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    this.assertMerchant(user);
    return this.pickupSlotsService.toggleMySlot(user.sub, id);
  }

  private assertMerchant(user: JwtPayload): void {
    if (!user || user.role !== Role.MERCHANT) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTH_FORBIDDEN,
        message: 'Requires role: MERCHANT',
      });
    }
  }
}
