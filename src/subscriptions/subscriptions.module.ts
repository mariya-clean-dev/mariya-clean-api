import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StripeModule } from 'src/stripe/stripe.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { ResponseModule } from 'src/response/response.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    StripeModule,
    PaymentsModule,
    ResponseModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
