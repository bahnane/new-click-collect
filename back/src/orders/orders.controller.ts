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
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('orders/checkout')
  checkout(@CurrentUser() user: JwtPayload, @Body() dto: CheckoutOrderDto) {
    this.assertCustomer(user);
    return this.ordersService.checkout(user.sub, dto);
  }

  @Get('orders/me')
  getMyOrders(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.assertCustomer(user);
    return this.ordersService.listMyOrders(
      user.sub,
      this.toPositiveInt(page, 1),
      this.toPositiveInt(pageSize, 10),
    );
  }

  @Get('orders/me/:id')
  getMyOrderById(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    this.assertCustomer(user);
    return this.ordersService.getMyOrderById(user.sub, id);
  }

  @Get('merchants/me/orders')
  getMerchantOrders(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.assertMerchant(user);
    return this.ordersService.listMerchantOrders(
      user.sub,
      status,
      this.toPositiveInt(page, 1),
      this.toPositiveInt(pageSize, 10),
    );
  }

  @Get('merchants/me/orders/:id')
  getMerchantOrderById(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    this.assertMerchant(user);
    return this.ordersService.getMerchantOrderById(user.sub, id);
  }

  @Patch('merchants/me/orders/:id/status')
  updateMerchantOrderStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    this.assertMerchant(user);
    return this.ordersService.updateMerchantOrderStatus(user.sub, id, dto);
  }

  private assertCustomer(user: JwtPayload): void {
    if (!user || user.role !== Role.CUSTOMER) {
      throw new ForbiddenException('Requires role: CUSTOMER');
    }
  }

  private assertMerchant(user: JwtPayload): void {
    if (!user || user.role !== Role.MERCHANT) {
      throw new ForbiddenException('Requires role: MERCHANT');
    }
  }

  private toPositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
