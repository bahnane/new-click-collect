import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { durationToMs } from '../common/utils/duration.util';
import { generateOpaqueToken, hashToken } from '../common/utils/token.util';
import { MailService } from '../mail/mail.service';
import { PickupSlotsService } from '../pickup-slots/pickup-slots.service';
import { PrismaService } from '../prisma/prisma.service';
import { ErrorCodes } from '../common/errors/api-error-codes';
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
    private readonly pickupSlotsService: PickupSlotsService,
  ) {}

  async createInvitedMerchant(dto: CreateMerchantDto) {
    const email = normalizeEmail(dto.email);
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException({
        code: ErrorCodes.MERCHANT_EMAIL_ALREADY_USED,
        message: 'A user already exists with this email',
      });
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
      const slug = await this.buildUniqueMerchantSlug(tx, dto.storeName);

      const user = await tx.user.create({
        data: {
          email,
          passwordHash: temporaryPasswordHash,
          role: Role.MERCHANT,
          status: UserStatus.INVITED,
          mustChangePassword: true,
          merchantProfile: {
            create: {
              slug,
              storeName: dto.storeName,
              businessType: dto.businessType,
              phone: dto.phone,
              address: dto.address,
              ...(dto.openingHours?.length
                ? {
                    openingHours: {
                      create: dto.openingHours.map((entry) => ({
                        dayOfWeek: entry.dayOfWeek,
                        startHour: entry.startHour,
                        endHour: entry.endHour,
                      })),
                    },
                  }
                : {}),
              pickupHours: {
                create: dto.pickupHours.map((entry) => ({
                  dayOfWeek: entry.dayOfWeek,
                  startHour: entry.startHour,
                  endHour: entry.endHour,
                })),
              },
            },
          },
        },
        include: {
          merchantProfile: {
            include: {
              openingHours: { orderBy: { dayOfWeek: 'asc' } },
              pickupHours: { orderBy: { dayOfWeek: 'asc' } },
            },
          },
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
      include: {
        openingHours: { orderBy: { dayOfWeek: 'asc' } },
        pickupHours: { orderBy: { dayOfWeek: 'asc' } },
      },
    });

    if (!profile) {
      throw new NotFoundException({
        code: ErrorCodes.MERCHANT_PROFILE_NOT_FOUND,
        message: 'Merchant profile not found',
      });
    }

    return profile;
  }

  async listPublicActiveMerchants(page = 1, pageSize = 12) {
    const {
      skip,
      take,
      page: safePage,
      pageSize: safePageSize,
    } = this.normalizePagination(page, pageSize);

    const where = { isActive: true };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.merchantProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          slug: true,
          storeName: true,
          businessType: true,
          description: true,
          city: true,
          zipCode: true,
          address: true,
          isActive: true,
        },
      }),
      this.prisma.merchantProfile.count({ where }),
    ]);

    return {
      data,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async getPublicActiveMerchantBySlug(slug: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        storeName: true,
        businessType: true,
        description: true,
        phone: true,
        address: true,
        city: true,
        zipCode: true,
        isActive: true,
        openingHours: {
          orderBy: { dayOfWeek: 'asc' },
          select: {
            dayOfWeek: true,
            startHour: true,
            endHour: true,
          },
        },
        pickupHours: {
          orderBy: { dayOfWeek: 'asc' },
          select: {
            dayOfWeek: true,
            startHour: true,
            endHour: true,
          },
        },
      },
    });

    if (!profile || !profile.isActive) {
      throw new NotFoundException({
        code: ErrorCodes.MERCHANT_NOT_FOUND,
        message: 'Merchant not found',
      });
    }

    return profile;
  }

  async updateMyProfile(userId: string, dto: UpdateMerchantProfileDto) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException({
        code: ErrorCodes.MERCHANT_PROFILE_NOT_FOUND,
        message: 'Merchant profile not found',
      });
    }

    const updatedProfile = await this.prisma.merchantProfile.update({
      where: { userId },
      data: this.buildMerchantProfileUpdateData(dto),
      include: {
        openingHours: { orderBy: { dayOfWeek: 'asc' } },
        pickupHours: { orderBy: { dayOfWeek: 'asc' } },
      },
    });

    if (dto.pickupHours) {
      await this.pickupSlotsService.regenerateMyFutureSlots(userId);
    }

    return updatedProfile;
  }

  async listAllMerchants(page = 1, pageSize = 10) {
    const {
      skip,
      take,
      page: safePage,
      pageSize: safePageSize,
    } = this.normalizePagination(page, pageSize);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.merchantProfile.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          openingHours: { orderBy: { dayOfWeek: 'asc' } },
          pickupHours: { orderBy: { dayOfWeek: 'asc' } },
          user: {
            select: { id: true, email: true, status: true, lastLoginAt: true },
          },
        },
      }),
      this.prisma.merchantProfile.count(),
    ]);

    return {
      data,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async getMerchantById(merchantProfileId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { id: merchantProfileId },
      include: {
        openingHours: { orderBy: { dayOfWeek: 'asc' } },
        pickupHours: { orderBy: { dayOfWeek: 'asc' } },
        user: {
          select: { id: true, email: true, status: true, lastLoginAt: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException({
        code: ErrorCodes.MERCHANT_NOT_FOUND,
        message: 'Merchant not found',
      });
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
      throw new NotFoundException({
        code: ErrorCodes.MERCHANT_NOT_FOUND,
        message: 'Merchant not found',
      });
    }

    return this.prisma.merchantProfile.update({
      where: { id: merchantProfileId },
      data: { isActive: dto.isActive },
    });
  }

  private buildMerchantProfileUpdateData(
    dto: UpdateMerchantProfileDto,
  ): Prisma.MerchantProfileUpdateInput {
    const { openingHours, pickupHours, ...profileFields } = dto;

    return {
      ...profileFields,
      ...(openingHours
        ? {
            openingHours: {
              deleteMany: {},
              create: openingHours.map((entry) => ({
                dayOfWeek: entry.dayOfWeek,
                startHour: entry.startHour,
                endHour: entry.endHour,
              })),
            },
          }
        : {}),
      ...(pickupHours
        ? {
            pickupHours: {
              deleteMany: {},
              create: pickupHours.map((entry) => ({
                dayOfWeek: entry.dayOfWeek,
                startHour: entry.startHour,
                endHour: entry.endHour,
              })),
            },
          }
        : {}),
    };
  }

  private normalizePagination(page: number, pageSize: number) {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safePageSize =
      Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 10;

    return {
      page: safePage,
      pageSize: safePageSize,
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    };
  }

  private async buildUniqueMerchantSlug(
    tx: Prisma.TransactionClient | PrismaService,
    storeName: string,
    excludeMerchantId?: string,
  ): Promise<string> {
    const baseSlug = this.toSlug(storeName);

    let candidate = baseSlug;
    let index = 2;

    while (true) {
      const existing = await tx.merchantProfile.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!existing || existing.id === excludeMerchantId) {
        return candidate;
      }

      candidate = `${baseSlug}-${index}`;
      index += 1;
    }
  }

  private toSlug(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'merchant';
  }
}
