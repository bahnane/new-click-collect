import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { MerchantsService } from './merchants.service';

@Controller('admin/merchants')
@UseGuards(JwtAuthGuard)
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Post()
  async createMerchant(
    @Body() dto: CreateMerchantDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    if (!currentUser || currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only administrators can create merchant accounts',
      );
    }

    return this.merchantsService.createInvitedMerchant(dto);
  }
}
