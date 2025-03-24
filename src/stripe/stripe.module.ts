import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { StripeWebhookController } from './stripe-webhook.controller.ts';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [ConfigModule, NotificationsModule],
  providers: [StripeService],
  exports: [StripeService],
  controllers: [StripeWebhookController],
})
export class StripeModule {}
