import { IsString, IsNotEmpty, IsOptional, IsISO8601 } from 'class-validator';

export class CreateScheduleDto {
  @IsString()
  @IsNotEmpty()
  staffId: string;

  @IsString()
  @IsOptional()
  bookingId?: string;

  @IsISO8601()
  @IsNotEmpty()
  startTime: string;

  @IsISO8601()
  @IsNotEmpty()
  endTime: string;
}
