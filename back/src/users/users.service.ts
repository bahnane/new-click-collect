import { AppLanguage } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from 'src/common/utils/mail.utils';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: {
        email: normalizeEmail(email),
      },
    });
  }

  async updatePreferredLanguage(
    userId: string,
    preferredLanguage: AppLanguage,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { preferredLanguage },
    });
  }
}
