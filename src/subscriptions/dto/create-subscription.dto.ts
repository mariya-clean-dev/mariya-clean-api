import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
  IsISO8601,
} from 'class-validator';
import { RecurringType } from '@prisma/client';

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @IsEnum(RecurringType)
  @IsNotEmpty()
  recurringType: RecurringType;

  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  recurringFrequency: number;

  @IsISO8601()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsOptional()
  stripeSubscriptionId?: string;

  @IsString()
  @IsOptional()
  paymentMethodId?: string;
}
