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
  IsEmail,
  IsInt,
  ValidateIf,
  Min,
} from 'class-validator';
import { PaymentMethodEnum, ServiceType } from '@prisma/client';
import { Type } from 'class-transformer';

export class BookingScheduleDto {
  // @IsInt()
  // weekOfMonth: number;

  @IsInt()
  dayOfWeek: number;

  @IsString()
  @IsNotEmpty()
  time: string;
}

class BookingAddressDto {
  @IsString()
  @IsOptional()
  street?: string;

  @IsString()
  @IsOptional()
  landmark?: string;

  @IsString()
  @IsNotEmpty()
  addressLine1: string;

  @IsString()
  @IsOptional()
  addressLine2?: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsOptional()
  state?: string;

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

  @IsEnum(PaymentMethodEnum)
  @IsNotEmpty()
  paymentMethod: PaymentMethodEnum;

  @IsString()
  @IsOptional()
  subscriptionId?: string;

  @ValidateIf((o) => o.type === ServiceType.one_time)
  @IsISO8601()
  @IsNotEmpty()
  date?: Date;

  @ValidateIf((o) => o.type === ServiceType.one_time)
  @IsString()
  @IsNotEmpty()
  time?: string;

  @IsNumber()
  @IsNotEmpty()
  areaSize: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  no_of_rooms: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  no_of_bathrooms: number;

  @IsBoolean()
  @IsOptional()
  isEco?: boolean = false;

  @IsString()
  @IsOptional()
  propertyType?: string;

  @IsOptional()
  @IsBoolean()
  materialProvided?: boolean;

  @IsNumber()
  @IsNotEmpty()
  price: number;

  @IsString()
  @IsOptional()
  subscriptionTypeId?: string;

  @IsString()
  @ValidateIf((o) => o.type === ServiceType.recurring)
  recurringTypeId?: string;

  @ValidateNested()
  @Type(() => BookingAddressDto)
  address: BookingAddressDto;

  @IsArray()
  @IsOptional()
  addOnIds?: string[];

  @ValidateIf((o) => o.type === ServiceType.recurring)
  @IsISO8601()
  @IsNotEmpty()
  startDate?: string;

  //add user details

  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @ValidateNested()
  @Type(() => BookingScheduleDto)
  @IsOptional()
  schedule?: BookingScheduleDto;

  // @ValidateNested()
  // @Type(() => BookingScheduleDto)
  // @IsNotEmpty()
  // schedule_1: BookingScheduleDto;

  // @ValidateIf((o) => o.schedule_1)
  // @ValidateNested()
  // @Type(() => BookingScheduleDto)
  // schedule_2?: BookingScheduleDto;

  // @ValidateIf((o) => o.schedule_2)
  // @ValidateNested()
  // @Type(() => BookingScheduleDto)
  // schedule_3?: BookingScheduleDto;

  // @ValidateIf((o) => o.schedule_3)
  // @ValidateNested()
  // @Type(() => BookingScheduleDto)
  // schedule_4?: BookingScheduleDto;
}
