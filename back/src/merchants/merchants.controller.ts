import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
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

@Controller()
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get('merchants')
  listPublicMerchants(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.merchantsService.listPublicActiveMerchants(
      this.toPositiveInt(page, 1),
      this.toPositiveInt(pageSize, 12),
    );
  }

  @Get('merchants/:slug')
  getPublicMerchantBySlug(@Param('slug') slug: string) {
    return this.merchantsService.getPublicActiveMerchantBySlug(slug);
  }

  // ── Routes commerçant ────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('merchants/me')
  getMyProfile(@CurrentUser() user: JwtPayload) {
    this.assertRole(user, Role.MERCHANT);
    return this.merchantsService.getMyProfile(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('merchants/me')
  updateMyProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMerchantProfileDto,
  ) {
    this.assertRole(user, Role.MERCHANT);
    return this.merchantsService.updateMyProfile(user.sub, dto);
  }

  // ── Routes admin ─────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('admin/merchants')
  createMerchant(
    @Body() dto: CreateMerchantDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.assertRole(user, Role.ADMIN);
    return this.merchantsService.createInvitedMerchant(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/merchants')
  listMerchants(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.assertRole(user, Role.ADMIN);
    return this.merchantsService.listAllMerchants(
      this.toPositiveInt(page, 1),
      this.toPositiveInt(pageSize, 10),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/merchants/:id')
  getMerchant(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    this.assertRole(user, Role.ADMIN);
    return this.merchantsService.getMerchantById(id);
  }

  @UseGuards(JwtAuthGuard)
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

  private toPositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
