import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ApprovedMerchantGuard } from './guards/approved-merchant.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.register({}),
    UsersModule,
    MailModule,
  ],
  providers: [AuthService, JwtStrategy, ApprovedMerchantGuard],
  controllers: [AuthController],
  exports: [AuthService, ApprovedMerchantGuard],
})
export class AuthModule {}
