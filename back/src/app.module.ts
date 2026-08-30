import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MerchantsModule } from './merchants/merchants.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { PickupSlotsModule } from './pickup-slots/pickup-slots.module';
import { AddressSearchModule } from './address-search/address-search.module';
import { BusinessTypesModule } from './business-types/business-types.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    MerchantsModule,
    MailModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    PickupSlotsModule,
    AddressSearchModule,
    BusinessTypesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
