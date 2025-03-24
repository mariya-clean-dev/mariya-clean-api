import {
  IsString,
  IsOptional,
  IsEnum,
  IsISO8601,
  ValidateNested,
} from 'class-validator';
import { BookingStatus } from '@prisma/client';
import { Type } from 'class-transformer';

class UpdateBookingAddressDto {
  @IsString()
  @IsOptional()
  street?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  zip?: string;

  @IsString()
  @IsOptional()
  specialInstructions?: string;
}

export class UpdateBookingDto {
  @IsEnum(BookingStatus)
  @IsOptional()
  status?: BookingStatus;

  @IsISO8601()
  @IsOptional()
  scheduledDate?: string;

  @ValidateNested()
  @Type(() => UpdateBookingAddressDto)
  @IsOptional()
  address?: UpdateBookingAddressDto;
}
