import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { StripeWebhookController } from './stripe-webhook.controller.ts';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { MailerModule } from 'src/mailer/mailer.module';
import { SchedulerModule } from 'src/scheduler/scheduler.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { BookingsModule } from 'src/bookings/bookings.module'; // ✅ Add this

@Module({
  imports: [
    ConfigModule,
    NotificationsModule,
    MailerModule,
    forwardRef(() => SchedulerModule),
    forwardRef(() => BookingsModule), 
    PaymentsModule,
  ],
  providers: [StripeService],
  exports: [StripeService],
  controllers: [StripeWebhookController],
})
export class StripeModule {}
