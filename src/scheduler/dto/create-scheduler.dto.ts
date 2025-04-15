import { ScheduleStatus } from '@prisma/client';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsISO8601,
  IsEnum,
} from 'class-validator';

export class CreateScheduleDto {
  @IsString()
  @IsNotEmpty()
  staffId: string;

  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @IsString()
  @IsOptional()
  bookingId?: string;

  @IsEnum(ScheduleStatus)
  @IsOptional()
  status: ScheduleStatus;

  @IsISO8601()
  @IsNotEmpty()
  startTime: string;

  @IsISO8601()
  @IsNotEmpty()
  endTime: string;

  @IsISO8601()
  @IsOptional()
  actualStartTime: string;

  @IsISO8601()
  @IsOptional()
  actualEndTime: string;
}
