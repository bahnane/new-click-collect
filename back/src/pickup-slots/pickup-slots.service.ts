import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePickupSlotDto } from './dto/create-pickup-slot.dto';
import { UpdatePickupSlotDto } from './dto/update-pickup-slot.dto';

@Injectable()
export class PickupSlotsService {
  constructor(private readonly prisma: PrismaService) {}

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
