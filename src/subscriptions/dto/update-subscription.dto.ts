import { IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { SubscriptionStatus, RecurringTypeEnum } from '@prisma/client';

export class UpdateSubscriptionDto {
  @IsEnum(SubscriptionStatus)
  @IsOptional()
  status?: SubscriptionStatus;

  @IsEnum(RecurringTypeEnum)
  @IsOptional()
  recurringType?: RecurringTypeEnum;

  @IsNumber()
  @IsOptional()
  @Min(1)
  recurringFrequency?: number;

  @IsString()
  @IsOptional()
  cancellationReason?: string;

  @IsString()
  @IsOptional()
  stripeSubscriptionId?: string;
}
