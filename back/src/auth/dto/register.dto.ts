import { AppLanguage } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(AppLanguage)
  preferredLanguage?: AppLanguage;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
