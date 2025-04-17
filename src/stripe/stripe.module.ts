import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { StripeWebhookController } from './stripe-webhook.controller.ts';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { MailerModule } from 'src/mailer/mailer.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ConfigModule, NotificationsModule, MailerModule, ScheduleModule],
  providers: [StripeService],
  exports: [StripeService],
  controllers: [StripeWebhookController],
})
export class StripeModule {}
