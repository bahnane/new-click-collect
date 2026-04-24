import { AppLanguage } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePreferredLanguageDto {
  @IsEnum(AppLanguage)
  preferredLanguage: AppLanguage;
}
