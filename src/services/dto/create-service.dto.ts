import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsNotEmpty()
  durationMinutes: number;

  @IsNumber()
  @IsNotEmpty()
  base_price: number;

  @IsNumber()
  @IsNotEmpty()
  bathroom_rate: number;

  @IsNumber()
  @IsNotEmpty()
  room_rate: number;

  @IsNumber()
  @IsNotEmpty()
  square_foot_price: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @IsArray()
  @IsOptional()
  categoryIds?: string[];
}
