import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class UpdateServiceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  durationMinutes?: number;

  @IsNumber()
  @IsOptional()
  base_price?: number;

  @IsNumber()
  @IsOptional()
  bathroom_rate?: number;

  @IsNumber()
  @IsOptional()
  room_rate?: number;

  @IsNumber()
  @IsOptional()
  square_foot_price?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsOptional()
  categoryIds?: string[];
}
