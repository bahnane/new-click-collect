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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import {
  UpdateMerchantProfileDto,
  UpdateMerchantStatusDto,
} from './dto/update-merchant-profile.dto';
import { MerchantsService } from './merchants.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  // ── Routes commerçant ────────────────────────────────────────────────────

  @Get('merchants/me')
  getMyProfile(@CurrentUser() user: JwtPayload) {
    this.assertRole(user, Role.MERCHANT);
    return this.merchantsService.getMyProfile(user.sub);
  }

  @Patch('merchants/me')
  updateMyProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMerchantProfileDto,
  ) {
    this.assertRole(user, Role.MERCHANT);
    return this.merchantsService.updateMyProfile(user.sub, dto);
  }

  // ── Routes admin ─────────────────────────────────────────────────────────

  @Post('admin/merchants')
  createMerchant(
    @Body() dto: CreateMerchantDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.assertRole(user, Role.ADMIN);
    return this.merchantsService.createInvitedMerchant(dto);
  }

  @Get('admin/merchants')
  listMerchants(@CurrentUser() user: JwtPayload) {
    this.assertRole(user, Role.ADMIN);
    return this.merchantsService.listAllMerchants();
  }

  @Get('admin/merchants/:id')
  getMerchant(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    this.assertRole(user, Role.ADMIN);
    return this.merchantsService.getMerchantById(id);
  }

  @Patch('admin/merchants/:id/status')
  updateMerchantStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMerchantStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.assertRole(user, Role.ADMIN);
    return this.merchantsService.updateMerchantStatus(id, dto);
  }

  // ── Helper ───────────────────────────────────────────────────────────────

  private assertRole(user: JwtPayload, required: Role): void {
    if (!user || user.role !== required) {
      throw new ForbiddenException(`Requires role: ${required}`);
    }
  }
}
