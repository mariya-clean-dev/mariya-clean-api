import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class RescheduleDto {
  @IsISO8601()
  newDate: Date;

  @IsString()
  @IsNotEmpty()
  time: string;
}
