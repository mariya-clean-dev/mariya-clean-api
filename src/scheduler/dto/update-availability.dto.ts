import {
  IsInt,
  IsString,
  IsBoolean,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class UpdateAvailabilityDto {
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}
