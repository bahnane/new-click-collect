import { IsString, MaxLength, MinLength } from 'class-validator';

export class ActivateInviteDto {
  @IsString()
  @MinLength(20)
  @MaxLength(255)
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
