import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class CreateAvailabilityDto {
  @IsString()
  @IsNotEmpty()
  staffId: string;

  @IsInt()
  @IsNotEmpty()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}
