import {
  Body,
  Controller,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { ActivateInviteDto } from './dto/activate-invite.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdatePreferredLanguageDto } from './dto/update-preferred-language.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.register(dto);
    this.authService.setRefreshTokenCookie(response, session.refreshToken);

    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.login(dto);
    this.authService.setRefreshTokenCookie(response, session.refreshToken);

    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post('activate-invite')
  async activateInvite(
    @Body() dto: ActivateInviteDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.activateInvite(dto);
    this.authService.setRefreshTokenCookie(response, session.refreshToken);

    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const currentRefreshToken =
      this.authService.extractRefreshTokenFromRequest(request);
    const session = await this.authService.refresh(currentRefreshToken);
    this.authService.setRefreshTokenCookie(response, session.refreshToken);

    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const currentRefreshToken =
      this.authService.extractRefreshTokenFromRequest(request);
    const result = await this.authService.logout(currentRefreshToken);
    this.authService.clearRefreshTokenCookie(response);
    return result;
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.resetPassword(dto);
    this.authService.clearRefreshTokenCookie(response);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/preferred-language')
  updatePreferredLanguage(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdatePreferredLanguageDto,
  ) {
    return this.authService.updatePreferredLanguage(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.changePassword(userId, dto);
    this.authService.clearRefreshTokenCookie(response);
    return result;
  }
}
