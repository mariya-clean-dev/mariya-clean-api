import { IsEmail, IsString, IsOptional, IsEnum, IsInt } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsInt()
  @IsOptional()
  priority?: number;

  @IsString()
  role: string;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus = UserStatus.active;
}
