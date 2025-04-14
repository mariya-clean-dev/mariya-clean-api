import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class RescheduleDto {
  @IsInt()
  month: number;

  @IsInt()
  weekOfMonth: number;

  @IsInt()
  dayOfWeek: number;

  @IsInt()
  @IsOptional()
  year?: number;

  @IsString()
  @IsNotEmpty()
  time: string;
}
