import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { ErrorCodes } from '../common/errors/api-error-codes';
import { CartService } from './cart.service';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';

@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getMyCart(@CurrentUser() user: JwtPayload) {
    this.assertCustomer(user);
    return this.cartService.getMyCart(user.sub);
  }

  @Post('items')
  upsertItem(@CurrentUser() user: JwtPayload, @Body() dto: UpsertCartItemDto) {
    this.assertCustomer(user);
    return this.cartService.upsertMyCartItem(user.sub, dto);
  }

  @Delete('items/:itemId')
  removeItem(@CurrentUser() user: JwtPayload, @Param('itemId') itemId: string) {
    this.assertCustomer(user);
    return this.cartService.removeMyCartItem(user.sub, itemId);
  }

  private assertCustomer(user: JwtPayload): void {
    if (!user || user.role !== Role.CUSTOMER) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTH_FORBIDDEN,
        message: 'Requires role: CUSTOMER',
      });
    }
  }
}
