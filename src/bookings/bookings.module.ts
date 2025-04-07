import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ResponseModule } from 'src/response/response.module';
import { UsersModule } from 'src/users/users.module';
import { StripeModule } from 'src/stripe/stripe.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { SubscriptionsModule } from 'src/subscriptions/subscriptions.module';
import { SchedulerModule } from 'src/scheduler/scheduler.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    ResponseModule,
    UsersModule,
    StripeModule,
    PaymentsModule,
    SubscriptionsModule,
    SchedulerModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
