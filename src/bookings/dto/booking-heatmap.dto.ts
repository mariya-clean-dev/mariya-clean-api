import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class BookingHeatmapDto {
  @IsInt()
  @Min(2020)
  @Max(2100)
  @Transform(({ value }) => parseInt(value))
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  @Transform(({ value }) => parseInt(value))
  month: number;

  @IsOptional()
  @IsString()
  staffId?: string;
}
