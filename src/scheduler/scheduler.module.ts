import { forwardRef, Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ResponseModule } from 'src/response/response.module';
import { BookingsService } from 'src/bookings/bookings.service';
import { BookingsModule } from 'src/bookings/bookings.module';
import Stripe from 'stripe';
import { StripeModule } from 'src/stripe/stripe.module';
import { PaymentsModule } from 'src/payments/payments.module';

@Module({
  imports: [
    PrismaModule,
    ResponseModule,
    forwardRef(() => BookingsModule),
    forwardRef(() => StripeModule),
    PaymentsModule,
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
