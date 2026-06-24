import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MerchantProfileStatus, Role } from '@prisma/client';
import { ErrorCodes } from '../../common/errors/api-error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class ApprovedMerchantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (!user || user.role !== Role.MERCHANT) {
      return true;
    }

    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId: user.sub },
      select: {
        id: true,
        isActive: true,
        status: true,
      },
    });

    if (!profile) {
      throw new NotFoundException({
        code: ErrorCodes.MERCHANT_PROFILE_NOT_FOUND,
        message: 'Merchant profile not found',
      });
    }

    if (!profile.isActive) {
      throw new ForbiddenException({
        code: ErrorCodes.MERCHANT_ACCOUNT_INACTIVE,
        message: 'Merchant account is inactive',
      });
    }

    if (profile.status !== MerchantProfileStatus.APPROVED) {
      throw new ForbiddenException({
        code: ErrorCodes.MERCHANT_PROFILE_NOT_APPROVED,
        message: 'Merchant profile is not approved yet',
      });
    }

    return true;
  }
}
