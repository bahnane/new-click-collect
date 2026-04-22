import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Weekday } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePickupSlotDto } from './dto/create-pickup-slot.dto';
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
      select: { id: true, isActive: true },
    });

    if (!merchant || !merchant.isActive) {
      throw new NotFoundException('Merchant not found');
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
        maxOrders: true,
        currentOrders: true,
      },
    });

    return slots.filter((slot) => slot.currentOrders < slot.maxOrders);
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
      throw new ConflictException('Pickup slot overlaps with an existing slot');
    }

    return this.prisma.pickupSlot.create({
      data: {
        merchantId: profile.id,
        startsAt,
        endsAt,
        maxOrders: dto.maxOrders ?? 10,
      },
    });
  }

  async updateMySlot(userId: string, slotId: string, dto: UpdatePickupSlotDto) {
    const profile = await this.resolveMerchantProfile(userId);

    const slot = await this.prisma.pickupSlot.findUnique({
      where: { id: slotId },
    });
    if (!slot || slot.merchantId !== profile.id) {
      throw new NotFoundException('Pickup slot not found');
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
      throw new ConflictException('Pickup slot overlaps with an existing slot');
    }

    if (dto.maxOrders != null && dto.maxOrders < slot.currentOrders) {
      throw new BadRequestException(
        'maxOrders cannot be lower than currentOrders',
      );
    }

    return this.prisma.pickupSlot.update({
      where: { id: slotId },
      data: {
        startsAt,
        endsAt,
        ...(dto.maxOrders != null ? { maxOrders: dto.maxOrders } : {}),
      },
    });
  }

  async toggleMySlot(userId: string, slotId: string) {
    const profile = await this.resolveMerchantProfile(userId);

    const slot = await this.prisma.pickupSlot.findUnique({
      where: { id: slotId },
    });
    if (!slot || slot.merchantId !== profile.id) {
      throw new NotFoundException('Pickup slot not found');
    }

    return this.prisma.pickupSlot.update({
      where: { id: slotId },
      data: { isActive: !slot.isActive },
    });
  }

  private assertSlotDates(startsAt: Date, endsAt: Date) {
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Invalid pickup slot dates');
    }

    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
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
    const windowStart = this.startOfDay(new Date());
    const windowEnd = this.addDays(windowStart, daysAhead);

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
      throw new NotFoundException('Merchant profile not found');
    }

    const schedule = new Map<Weekday, { startHour: number; endHour: number }>();
    for (const row of profile.pickupHours) {
      schedule.set(row.dayOfWeek, {
        startHour: row.startHour,
        endHour: row.endHour,
      });
    }

    if (schedule.size === 0) {
      return {
        createdCount: 0,
        deletedCount: 0,
        daysAhead,
      };
    }

    const now = new Date();
    const rowsToCreate: {
      merchantId: string;
      startsAt: Date;
      endsAt: Date;
      maxOrders: number;
    }[] = [];

    for (let offset = 0; offset < daysAhead; offset += 1) {
      const dayDate = this.addDays(windowStart, offset);
      const dayKey = this.getWeekdayEnum(dayDate);
      const daySchedule = schedule.get(dayKey);

      if (!daySchedule) {
        continue;
      }

      const dayStart = this.withHour(dayDate, daySchedule.startHour);
      const dayEnd = this.withHour(dayDate, daySchedule.endHour);

      for (
        let startsAt = new Date(dayStart);
        startsAt < dayEnd;
        startsAt = this.addHours(startsAt, 2)
      ) {
        const endsAt = this.addHours(startsAt, 2);
        if (endsAt > dayEnd || startsAt <= now) {
          continue;
        }

        rowsToCreate.push({
          merchantId,
          startsAt,
          endsAt,
          maxOrders: 10,
        });
      }
    }

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

  private getWeekdayEnum(date: Date): Weekday {
    const map: Weekday[] = [
      Weekday.SUNDAY,
      Weekday.MONDAY,
      Weekday.TUESDAY,
      Weekday.WEDNESDAY,
      Weekday.THURSDAY,
      Weekday.FRIDAY,
      Weekday.SATURDAY,
    ];

    return map[date.getDay()];
  }

  private startOfDay(input: Date) {
    const date = new Date(input);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private addDays(input: Date, days: number) {
    const date = new Date(input);
    date.setDate(date.getDate() + days);
    return date;
  }

  private withHour(day: Date, hour: number) {
    const date = new Date(day);
    date.setHours(0, 0, 0, 0);
    date.setHours(hour, 0, 0, 0);
    return date;
  }

  private addHours(input: Date, hours: number) {
    return new Date(input.getTime() + hours * 60 * 60 * 1000);
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

    if (!profile) throw new NotFoundException('Merchant profile not found');
    if (!profile.isActive)
      throw new ForbiddenException('Merchant account is inactive');

    return profile;
  }
}
