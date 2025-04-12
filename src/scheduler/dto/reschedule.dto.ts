import { IsISO8601, IsNotEmpty, IsString } from 'class-validator';

export class RescheduleDto {
  // @IsNotEmpty()
  // @IsString()
  // staffId: string;

  @IsNotEmpty()
  @IsISO8601()
  newScheduleDate: Date; // The new date to reschedule the staff
}
