import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MerchantProfileStatus } from '@prisma/client';
import { ErrorCodes } from '../common/errors/api-error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePickupSlotDto } from './dto/create-pickup-slot.dto';
import {
  addDays,
  generatePickupSlotsForWindow,
  startOfDay,
} from './pickup-slot-generation.util';
import { UpdatePickupSlotDto } from './dto/update-pickup-slot.dto';

@Injectable()
export class PickupSlotsService {
  private readonly logger = new Logger(PickupSlotsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async regenerateMyFutureSlots(userId: string) {
    const profile = await this.resolveMerchantProfile(userId);
    const daysAhead = 7;

    return this.generateFutureSlotsForMerchant(profile.id, {
      daysAhead,
      replaceUnbookedInWindow: true,
    });
  }

  async generateFutureSlotsForAllActiveMerchants(daysAhead = 7) {
    const merchants = await this.prisma.merchantProfile.findMany({
      where: { isActive: true },
      select: {
        id: true,
      },
    });

    let createdCount = 0;
    let deletedCount = 0;
    let processedMerchants = 0;

    for (const merchant of merchants) {
      const result = await this.generateFutureSlotsForMerchant(merchant.id, {
        daysAhead,
        replaceUnbookedInWindow: false,
      });
      processedMerchants += 1;
      createdCount += result.createdCount;
      deletedCount += result.deletedCount;
    }

    return {
      processedMerchants,
      createdCount,
      deletedCount,
      daysAhead,
    };
  }

  async cleanupOldUnreferencedSlots() {
    const now = new Date();

    const cleanup = await this.prisma.pickupSlot.deleteMany({
      where: {
        endsAt: { lt: now },
        orders: { none: {} },
      },
    });

    this.logger.log(
      `Cleaned up ${cleanup.count} old unreferenced pickup slots`,
    );

    return {
      deletedCount: cleanup.count,
      cleanedBefore: now.toISOString(),
    };
  }

  async listPublicMerchantSlots(merchantId: string) {
    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        isActive: true,
        status: true,
        pickupSlotCapacity: true,
      },
    });

    if (
      !merchant ||
      !merchant.isActive ||
      merchant.status !== MerchantProfileStatus.APPROVED
    ) {
      throw new NotFoundException({
        code: ErrorCodes.MERCHANT_NOT_FOUND,
        message: 'Merchant not found',
      });
    }

    const slots = await this.prisma.pickupSlot.findMany({
      where: {
        merchantId,
        isActive: true,
        startsAt: { gt: new Date() },
      },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        currentOrders: true,
      },
    });

    return slots
      .filter((slot) => slot.currentOrders < merchant.pickupSlotCapacity)
      .map((slot) => ({
        ...slot,
        remainingPlaces: merchant.pickupSlotCapacity - slot.currentOrders,
      }));
  }

  async listMySlots(userId: string) {
    const profile = await this.resolveMerchantProfile(userId);

    return this.prisma.pickupSlot.findMany({
      where: { merchantId: profile.id },
      orderBy: { startsAt: 'asc' },
    });
  }

  async createMySlot(userId: string, dto: CreatePickupSlotDto) {
    const profile = await this.resolveMerchantProfile(userId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    this.assertSlotDates(startsAt, endsAt);

    const hasOverlap = await this.hasOverlappingSlot(
      profile.id,
      startsAt,
      endsAt,
    );
    if (hasOverlap) {
      throw new ConflictException({
        code: ErrorCodes.PICKUP_SLOT_OVERLAP,
        message: 'Pickup slot overlaps with an existing slot',
      });
    }

    return this.prisma.pickupSlot.create({
      data: {
        merchantId: profile.id,
        startsAt,
        endsAt,
      },
    });
  }

  async updateMySlot(userId: string, slotId: string, dto: UpdatePickupSlotDto) {
    const profile = await this.resolveMerchantProfile(userId);

    const slot = await this.prisma.pickupSlot.findUnique({
      where: { id: slotId },
    });
    if (!slot || slot.merchantId !== profile.id) {
      throw new NotFoundException({
        code: ErrorCodes.PICKUP_SLOT_NOT_FOUND,
        message: 'Pickup slot not found',
      });
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : slot.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : slot.endsAt;

    this.assertSlotDates(startsAt, endsAt);

    const hasOverlap = await this.hasOverlappingSlot(
      profile.id,
      startsAt,
      endsAt,
      slotId,
    );
    if (hasOverlap) {
      throw new ConflictException({
        code: ErrorCodes.PICKUP_SLOT_OVERLAP,
        message: 'Pickup slot overlaps with an existing slot',
      });
    }

    return this.prisma.pickupSlot.update({
      where: { id: slotId },
      data: { startsAt, endsAt },
    });
  }

  async toggleMySlot(userId: string, slotId: string) {
    const profile = await this.resolveMerchantProfile(userId);

    const slot = await this.prisma.pickupSlot.findUnique({
      where: { id: slotId },
    });
    if (!slot || slot.merchantId !== profile.id) {
      throw new NotFoundException({
        code: ErrorCodes.PICKUP_SLOT_NOT_FOUND,
        message: 'Pickup slot not found',
      });
    }

    return this.prisma.pickupSlot.update({
      where: { id: slotId },
      data: { isActive: !slot.isActive },
    });
  }

  private assertSlotDates(startsAt: Date, endsAt: Date) {
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException({
        code: ErrorCodes.PICKUP_SLOT_INVALID_DATES,
        message: 'Invalid pickup slot dates',
      });
    }

    if (endsAt <= startsAt) {
      throw new BadRequestException({
        code: ErrorCodes.PICKUP_SLOT_END_BEFORE_START,
        message: 'endsAt must be after startsAt',
      });
    }
  }

  private async generateFutureSlotsForMerchant(
    merchantId: string,
    options: {
      daysAhead: number;
      replaceUnbookedInWindow: boolean;
    },
  ) {
    const daysAhead = options.daysAhead;
    const windowStart = startOfDay(new Date());
    const windowEnd = addDays(windowStart, daysAhead);

    const profile = await this.prisma.merchantProfile.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
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

    if (!profile) {
      throw new NotFoundException({
        code: ErrorCodes.MERCHANT_PROFILE_NOT_FOUND,
        message: 'Merchant profile not found',
      });
    }

    const now = new Date();
    const rowsToCreate = generatePickupSlotsForWindow({
      merchantId,
      pickupHours: profile.pickupHours,
      daysAhead,
      now,
      slotDurationHours: 2,
    });

    let deletedCount = 0;
    if (options.replaceUnbookedInWindow) {
      const deletion = await this.prisma.pickupSlot.deleteMany({
        where: {
          merchantId,
          startsAt: { gte: now, lt: windowEnd },
          orders: { none: {} },
        },
      });
      deletedCount = deletion.count;
    }

    if (rowsToCreate.length === 0) {
      return {
        createdCount: 0,
        deletedCount,
        daysAhead,
      };
    }

    const created = await this.prisma.pickupSlot.createMany({
      data: rowsToCreate,
      skipDuplicates: true,
    });

    return {
      createdCount: created.count,
      deletedCount,
      daysAhead,
    };
  }

  private async hasOverlappingSlot(
    merchantId: string,
    startsAt: Date,
    endsAt: Date,
    excludeSlotId?: string,
  ) {
    const overlapping = await this.prisma.pickupSlot.findFirst({
      where: {
        merchantId,
        ...(excludeSlotId ? { NOT: { id: excludeSlotId } } : {}),
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });

    return Boolean(overlapping);
  }

  private async resolveMerchantProfile(userId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!profile)
      throw new NotFoundException({
        code: ErrorCodes.MERCHANT_PROFILE_NOT_FOUND,
        message: 'Merchant profile not found',
      });
    if (!profile.isActive)
      throw new ForbiddenException({
        code: ErrorCodes.MERCHANT_ACCOUNT_INACTIVE,
        message: 'Merchant account is inactive',
      });
    if (profile.status !== MerchantProfileStatus.APPROVED)
      throw new ForbiddenException({
        code: ErrorCodes.MERCHANT_PROFILE_NOT_APPROVED,
        message: 'Merchant profile is not approved yet',
      });

    return profile;
  }
}
