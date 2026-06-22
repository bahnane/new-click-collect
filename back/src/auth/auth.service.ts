import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppLanguage, Role, User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { CookieOptions, Request, Response } from 'express';
import { durationToMs } from '../common/utils/duration.util';
import { generateOpaqueToken, hashToken } from '../common/utils/token.util';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ErrorCodes } from '../common/errors/api-error-codes';
import { ActivateInviteDto } from './dto/activate-invite.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdatePreferredLanguageDto } from './dto/update-preferred-language.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtPayload } from './types/jwt-payload.type';
import { normalizeEmail } from 'src/common/utils/mail.utils';

type AuthenticatedUser = {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  preferredLanguage: AppLanguage;
  mustChangePassword: boolean;
};

type SessionResult = {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
};

type RefreshTokenJwtPayload = JwtPayload & {
  jti: string;
  type: 'refresh';
};

@Injectable()
export class AuthService {
  private readonly refreshCookieName = 'refreshToken';

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  getRefreshCookieName(): string {
    return this.refreshCookieName;
  }

  extractRefreshTokenFromRequest(request: Request): string | undefined {
    return request.cookies?.[this.refreshCookieName];
  }

  setRefreshTokenCookie(response: Response, refreshToken: string): void {
    response.cookie(
      this.refreshCookieName,
      refreshToken,
      this.getRefreshCookieOptions(),
    );
  }

  clearRefreshTokenCookie(response: Response): void {
    const cookieOptions = this.getRefreshCookieOptions();

    response.clearCookie(this.refreshCookieName, {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
    });
  }

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const email = normalizeEmail(dto.email);
    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException({
        code: ErrorCodes.AUTH_EMAIL_ALREADY_USED,
        message: 'Email is already used',
      });
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: Role.CUSTOMER,
        status: UserStatus.INVITED,
        preferredLanguage: dto.preferredLanguage ?? AppLanguage.fr,
        mustChangePassword: false,
      },
    });

    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() +
        durationToMs(
          this.configService.get<string>('EMAIL_VERIFICATION_EXPIRES_IN') ??
            '24h',
          24 * 60 * 60 * 1000,
        ),
    );
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.inviteToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });

      await tx.inviteToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
    const verificationLink = `${frontendUrl.replace(/\/$/, '')}/verify-email?token=${rawToken}`;

    await this.mailService.sendCustomerEmailVerificationEmail(
      user.email,
      verificationLink,
      user.preferredLanguage,
    );

    return {
      message: 'Account created. Please verify your email before logging in.',
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const tokenHash = hashToken(dto.token);
    const verificationToken = await this.prisma.inviteToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!verificationToken) {
      throw new BadRequestException({
        code: ErrorCodes.AUTH_EMAIL_VERIFICATION_TOKEN_INVALID_OR_EXPIRED,
        message: 'Email verification token is invalid or expired',
      });
    }

    if (verificationToken.user.role !== Role.CUSTOMER) {
      throw new BadRequestException({
        code: ErrorCodes.AUTH_INVITE_TOKEN_WRONG_ROLE,
        message: 'Email verification token is not a customer token',
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.inviteToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: now },
      });

      await tx.user.update({
        where: { id: verificationToken.userId },
        data: {
          status: UserStatus.ACTIVE,
          mustChangePassword: false,
        },
      });
    });

    return {
      message: 'Email verified successfully. You can now log in.',
    };
  }

  async login(dto: LoginDto): Promise<SessionResult> {
    const email = normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    this.assertCanAuthenticate(user);

    const isValidPassword = await argon2.verify(
      user.passwordHash,
      dto.password,
    );
    if (!isValidPassword) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
      },
    });

    return this.createSession(updatedUser);
  }

  async activateInvite(dto: ActivateInviteDto): Promise<SessionResult> {
    const tokenHash = hashToken(dto.token);

    const inviteToken = await this.prisma.inviteToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!inviteToken) {
      throw new BadRequestException({
        code: ErrorCodes.AUTH_INVITE_TOKEN_INVALID_OR_EXPIRED,
        message: 'Invitation token is invalid or expired',
      });
    }

    if (inviteToken.user.role !== Role.MERCHANT) {
      throw new BadRequestException({
        code: ErrorCodes.AUTH_INVITE_TOKEN_WRONG_ROLE,
        message: 'Invitation token is not a merchant invitation',
      });
    }

    const passwordHash = await argon2.hash(dto.password);
    const now = new Date();

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      await tx.inviteToken.update({
        where: { id: inviteToken.id },
        data: { usedAt: now },
      });

      await tx.refreshToken.updateMany({
        where: {
          userId: inviteToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      return tx.user.update({
        where: { id: inviteToken.userId },
        data: {
          passwordHash,
          status: UserStatus.ACTIVE,
          mustChangePassword: false,
          lastLoginAt: now,
        },
      });
    });

    return this.createSession(updatedUser);
  }

  async refresh(refreshToken: string | undefined): Promise<SessionResult> {
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_REFRESH_TOKEN_REQUIRED,
        message: 'Refresh token is required',
      });
    }

    const decodedToken = await this.verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: true,
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_REFRESH_TOKEN_INVALID,
        message: 'Invalid refresh token',
      });
    }

    if (storedToken.revokedAt || storedToken.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_REFRESH_TOKEN_EXPIRED_OR_REVOKED,
        message: 'Refresh token is expired or revoked',
      });
    }

    if (
      decodedToken.type !== 'refresh' ||
      decodedToken.sub !== storedToken.userId
    ) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_REFRESH_TOKEN_INVALID,
        message: 'Invalid refresh token',
      });
    }

    this.assertCanAuthenticate(storedToken.user);

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const updatedUser = await this.prisma.user.update({
      where: { id: storedToken.userId },
      data: { lastLoginAt: new Date() },
    });

    return this.createSession(updatedUser);
  }

  async logout(refreshToken: string | undefined): Promise<{ message: string }> {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);

      await this.prisma.refreshToken.updateMany({
        where: {
          tokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return { message: 'Logged out successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const email = normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(email);

    const genericResponse = {
      message:
        'If this email exists, a password reset link has been sent successfully.',
    };

    if (!user || user.status === UserStatus.SUSPENDED) {
      return genericResponse;
    }

    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() +
        durationToMs(
          this.configService.get<string>('PASSWORD_RESET_EXPIRES_IN') ?? '30m',
          30 * 60 * 1000,
        ),
    );
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
    const resetLink = `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;

    await this.mailService.sendPasswordResetEmail(
      user.email,
      resetLink,
      user.preferredLanguage,
    );

    return genericResponse;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = hashToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!resetToken) {
      throw new BadRequestException({
        code: ErrorCodes.AUTH_RESET_TOKEN_INVALID_OR_EXPIRED,
        message: 'Password reset token is invalid or expired',
      });
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      });

      await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          status: UserStatus.ACTIVE,
          mustChangePassword: false,
        },
      });

      await tx.refreshToken.updateMany({
        where: {
          userId: resetToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });
    });

    return {
      message: 'Password has been reset successfully. Please log in again.',
    };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_USER_NOT_FOUND,
        message: 'User not found',
      });
    }

    const isCurrentPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.currentPassword,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_CURRENT_PASSWORD_INVALID,
        message: 'Current password is invalid',
      });
    }

    const isSamePassword = await argon2.verify(
      user.passwordHash,
      dto.newPassword,
    );
    if (isSamePassword) {
      throw new BadRequestException({
        code: ErrorCodes.AUTH_NEW_PASSWORD_SAME_AS_CURRENT,
        message: 'New password must be different from current password',
      });
    }

    const newPasswordHash = await argon2.hash(dto.newPassword);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          status: UserStatus.ACTIVE,
          mustChangePassword: false,
        },
      });

      await tx.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });
    });

    return {
      message: 'Password changed successfully. Please log in again.',
    };
  }

  async deleteMyAccount(userId: string): Promise<{ message: string }> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_USER_NOT_FOUND,
        message: 'User not found',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await tx.user.delete({
        where: { id: userId },
      });
    });

    return {
      message: 'Account deleted successfully.',
    };
  }

  async updatePreferredLanguage(
    userId: string,
    dto: UpdatePreferredLanguageDto,
  ): Promise<AuthenticatedUser> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_USER_NOT_FOUND,
        message: 'User not found',
      });
    }

    const updatedUser = await this.usersService.updatePreferredLanguage(
      userId,
      dto.preferredLanguage,
    );

    return this.toAuthenticatedUser(updatedUser);
  }

  private async createSession(user: User): Promise<SessionResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.getAccessTokenSecret(),
      expiresIn: this.getAccessTokenTtlSeconds(),
    });

    const refreshTokenPayload: RefreshTokenJwtPayload = {
      ...payload,
      jti: randomUUID(),
      type: 'refresh',
    };

    const refreshToken = await this.jwtService.signAsync(refreshTokenPayload, {
      secret: this.getRefreshTokenSecret(),
      expiresIn: this.getRefreshTokenTtlSeconds(),
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.getRefreshTokenTtlMs()),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: this.toAuthenticatedUser(user),
    };
  }

  private toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      preferredLanguage: user.preferredLanguage,
      mustChangePassword: user.mustChangePassword,
    };
  }

  private assertCanAuthenticate(user: User): void {
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTH_ACCOUNT_SUSPENDED,
        message: 'User account is suspended',
      });
    }

    if (user.status === UserStatus.INVITED) {
      if (user.role === Role.MERCHANT) {
        throw new ForbiddenException({
          code: ErrorCodes.AUTH_ACCOUNT_INVITED_NOT_ACTIVATED,
          message: 'User account must be activated before login',
        });
      }

      throw new ForbiddenException({
        code: ErrorCodes.AUTH_EMAIL_NOT_VERIFIED,
        message: 'Email must be verified before login',
      });
    }
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<RefreshTokenJwtPayload> {
    try {
      return await this.jwtService.verifyAsync<RefreshTokenJwtPayload>(
        refreshToken,
        {
          secret: this.getRefreshTokenSecret(),
        },
      );
    } catch {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_REFRESH_TOKEN_INVALID,
        message: 'Invalid refresh token',
      });
    }
  }

  private getAccessTokenSecret(): string {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not defined');
    }

    return secret;
  }

  private getRefreshTokenSecret(): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not defined');
    }

    return secret;
  }

  private getAccessTokenTtlMs(): number {
    return durationToMs(
      this.configService.get<string>('ACCESS_TOKEN_EXPIRES_IN') ?? '15m',
      15 * 60 * 1000,
    );
  }

  private getAccessTokenTtlSeconds(): number {
    return Math.max(1, Math.floor(this.getAccessTokenTtlMs() / 1000));
  }

  private getRefreshTokenTtlMs(): number {
    return durationToMs(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') ?? '30d',
      30 * 24 * 60 * 60 * 1000,
    );
  }

  private getRefreshTokenTtlSeconds(): number {
    return Math.max(1, Math.floor(this.getRefreshTokenTtlMs() / 1000));
  }

  private getRefreshCookieOptions(): CookieOptions {
    // TODO: COOKIE_SAMESITE & COOKIE_SECURE values
    const sameSiteRaw =
      this.configService.get<string>('COOKIE_SAMESITE')?.toLowerCase() ?? 'lax';
    const sameSite: CookieOptions['sameSite'] =
      sameSiteRaw === 'strict' ||
      sameSiteRaw === 'none' ||
      sameSiteRaw === 'lax'
        ? sameSiteRaw
        : 'lax';

    return {
      httpOnly: true,
      secure: this.configService.get<string>('COOKIE_SECURE') === 'true',
      sameSite,
      path: '/',
      maxAge: this.getRefreshTokenTtlMs(),
    };
  }
}
