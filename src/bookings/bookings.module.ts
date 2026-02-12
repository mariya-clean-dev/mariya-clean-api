import { forwardRef, Module } from '@nestjs/common';
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
import { MailerModule } from 'src/mailer/mailer.module';
import { ZonesModule } from 'src/zones/zones.module';
import { CouponsModule } from 'src/coupons/coupons.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    MailerModule,
    ResponseModule,
    ZonesModule,
    forwardRef(() => UsersModule),
    forwardRef(() => StripeModule),
    PaymentsModule, 
    SubscriptionsModule,
    forwardRef(() => SchedulerModule),
    CouponsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
