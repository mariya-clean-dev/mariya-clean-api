import { IsString, IsOptional, IsISO8601 } from 'class-validator';

export class UpdateScheduleDto {
  @IsISO8601()
  @IsOptional()
  startTime?: string;

  @IsISO8601()
  @IsOptional()
  endTime?: string;

  @IsISO8601()
  @IsOptional()
  actualStartTime?: string;

  @IsISO8601()
  @IsOptional()
  actualEndTime?: string;

  @IsString()
  @IsOptional()
  staffId?: string;

  @IsString()
  @IsOptional()
  bookingId?: string;
}
