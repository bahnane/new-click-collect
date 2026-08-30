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
import { ErrorCodes } from '../common/errors/api-error-codes';
import { BusinessTypesService } from './business-types.service';
import { CreateBusinessTypeDto } from './dto/create-business-type.dto';
import { UpdateBusinessTypeDto } from './dto/update-business-type.dto';

@Controller()
export class BusinessTypesController {
  constructor(private readonly businessTypesService: BusinessTypesService) {}

  @Get('business-types')
  listActive() {
    return this.businessTypesService.listActive();
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/business-types')
  listAdmin(@CurrentUser() user: JwtPayload) {
    this.assertAdmin(user);
    return this.businessTypesService.listAdmin();
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/business-types')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBusinessTypeDto) {
    this.assertAdmin(user);
    return this.businessTypesService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/business-types/:id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessTypeDto,
  ) {
    this.assertAdmin(user);
    return this.businessTypesService.update(id, dto);
  }

  private assertAdmin(user: JwtPayload): void {
    if (!user || user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTH_FORBIDDEN,
        message: 'Requires role: ADMIN',
      });
    }
  }
}
