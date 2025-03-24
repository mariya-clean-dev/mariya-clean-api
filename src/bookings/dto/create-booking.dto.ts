import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsDate,
  ValidateNested,
  IsISO8601,
  IsArray,
} from 'class-validator';
import { ServiceType } from '@prisma/client';
import { Type } from 'class-transformer';

class BookingAddressDto {
  @IsString()
  @IsNotEmpty()
  street: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  zip: string;

  @IsString()
  @IsOptional()
  specialInstructions?: string;
}

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @IsEnum(ServiceType)
  @IsNotEmpty()
  type: ServiceType;

  @IsString()
  @IsOptional()
  subscriptionId?: string;

  @IsNumber()
  @IsNotEmpty()
  areaSize: number;

  @IsBoolean()
  @IsOptional()
  isEco?: boolean = false;

  @IsNumber()
  @IsNotEmpty()
  price: number;

  @IsISO8601()
  @IsNotEmpty()
  scheduledDate: string;

  @ValidateNested()
  @Type(() => BookingAddressDto)
  address: BookingAddressDto;

  @IsArray()
  @IsOptional()
  addOnIds?: string[];
}
