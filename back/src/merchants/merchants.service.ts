import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { durationToMs } from '../common/utils/duration.util';
import { generateOpaqueToken, hashToken } from '../common/utils/token.util';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import {
  UpdateMerchantProfileDto,
  UpdateMerchantStatusDto,
} from './dto/update-merchant-profile.dto';
import { normalizeEmail } from 'src/common/utils/mail.utils';

@Injectable()
export class MerchantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async createInvitedMerchant(dto: CreateMerchantDto) {
    const email = normalizeEmail(dto.email);
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('A user already exists with this email');
    }

    const temporaryPasswordHash = await argon2.hash(generateOpaqueToken(24));
    const rawInviteToken = generateOpaqueToken();
    const inviteTokenHash = hashToken(rawInviteToken);
    const inviteTokenTtlMs = durationToMs(
      this.configService.get<string>('INVITE_TOKEN_EXPIRES_IN') ?? '7d',
      7 * 24 * 60 * 60 * 1000,
    );
    const inviteExpiresAt = new Date(Date.now() + inviteTokenTtlMs);

    const createdUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: temporaryPasswordHash,
          role: Role.MERCHANT,
          status: UserStatus.INVITED,
          mustChangePassword: true,
          merchantProfile: {
            create: {
              storeName: dto.storeName,
              phone: dto.phone,
              address: dto.address,
            },
          },
        },
        include: {
          merchantProfile: true,
        },
      });

      await tx.inviteToken.create({
        data: {
          userId: user.id,
          tokenHash: inviteTokenHash,
          expiresAt: inviteExpiresAt,
        },
      });

      return user;
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
    const activationLink = `${frontendUrl.replace(/\/$/, '')}/activate-invite?token=${rawInviteToken}`;

    await this.mailService.sendMerchantInvitationEmail(
      createdUser.email,
      activationLink,
      createdUser.merchantProfile?.storeName ?? dto.storeName,
    );

    return {
      id: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
      status: createdUser.status,
      mustChangePassword: createdUser.mustChangePassword,
      inviteExpiresAt,
    };
  }

  async getMyProfile(userId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Merchant profile not found');
    }

    return profile;
  }

  async updateMyProfile(userId: string, dto: UpdateMerchantProfileDto) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Merchant profile not found');
    }

    return this.prisma.merchantProfile.update({
      where: { userId },
      data: dto,
    });
  }

  async listAllMerchants() {
    return this.prisma.merchantProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, email: true, status: true, lastLoginAt: true },
        },
      },
    });
  }

  async getMerchantById(merchantProfileId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { id: merchantProfileId },
      include: {
        user: {
          select: { id: true, email: true, status: true, lastLoginAt: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Merchant not found');
    }

    return profile;
  }

  async updateMerchantStatus(
    merchantProfileId: string,
    dto: UpdateMerchantStatusDto,
  ) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { id: merchantProfileId },
    });

    if (!profile) {
      throw new NotFoundException('Merchant not found');
    }

    return this.prisma.merchantProfile.update({
      where: { id: merchantProfileId },
      data: { isActive: dto.isActive },
    });
  }
}
