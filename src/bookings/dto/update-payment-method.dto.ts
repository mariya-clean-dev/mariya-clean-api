import { IsEnum } from 'class-validator';
import { PaymentMethodEnum } from '@prisma/client';

export class UpdatePaymentMethodDto {
  @IsEnum(PaymentMethodEnum)
  paymentMethod: PaymentMethodEnum;
}
