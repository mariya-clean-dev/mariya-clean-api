import {
  Controller,
  Post,
  Headers,
  Body,
  BadRequestException,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationType,
  Prisma,
  SubscriptionStatus,
  TransactionStatus,
} from '@prisma/client';
import { MailService } from 'src/mailer/mailer.service';

@Controller('webhooks')
export class StripeWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  @Post('stripe')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    try {
      const webhookSecret = this.configService.get<string>(
        'STRIPE_WEBHOOK_SECRET',
      );
      const event = this.stripeService.verifyWebhookSignature(
        req.rawBody,
        signature,
        webhookSecret,
      );

      // Handle different event types
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object);
          break;
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object);
          break;
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object);
          break;
        case 'checkout.session.expired':
          await this.handleCheckoutSessionExpired(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object);
          break;
        // Add more event types as needed
      }

      return { received: true };
    } catch (err) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }
  }

  private async handlePaymentIntentSucceeded(paymentIntent: any) {
    console.log('handlePaymentIntentSucceeded');
    // Find the related booking by metadata
    if (paymentIntent.metadata?.bookingId) {
      const bookingId = paymentIntent.metadata.bookingId;
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          service: true,
          customer: true,
          bookingAddress: {
            include: { address: true },
          },
        },
      });

      if (booking) {
        // Create a transaction record
        await this.prisma.transaction.create({
          data: {
            bookingId,
            stripePaymentId: paymentIntent.id,
            stripeInvoiceId: paymentIntent.invoice || null,
            amount: paymentIntent.amount / 100, // Convert from cents
            currency: paymentIntent.currency,
            status: TransactionStatus.successful,
            paymentMethod: paymentIntent.payment_method_types[0] || 'card',
            transactionType: 'payment',
          },
        });

        await this.mailService.sendBookingConfirmationEmail(
          booking.customer.email,
          booking.customer.name,
          booking.service.name,
          booking.bookingAddress.address.line_1,
        );

        // Notify the customer
        await this.notificationsService.createNotification({
          userId: booking.userId,
          title: 'Payment Successful',
          message: `Your payment of ${(paymentIntent.amount / 100).toFixed(2)} ${paymentIntent.currency.toUpperCase()} for ${booking.service.name} was successful.`,
          notificationType: 'payment_confirmation',
          relatedBookingId: bookingId,
        });
      }
    }
  }

  private async handlePaymentIntentFailed(paymentIntent: any) {
    // Find the related booking by metadata
    if (paymentIntent.metadata?.bookingId) {
      const bookingId = paymentIntent.metadata.bookingId;
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: { service: true },
      });

      if (booking) {
        // Create a failed transaction record
        await this.prisma.transaction.create({
          data: {
            bookingId,
            stripePaymentId: paymentIntent.id,
            stripeInvoiceId: paymentIntent.invoice || null,
            amount: paymentIntent.amount / 100, // Convert from cents
            currency: paymentIntent.currency,
            status: TransactionStatus.failed,
            paymentMethod: paymentIntent.payment_method_types[0] || 'card',
            transactionType: 'payment',
            failureReason:
              paymentIntent.last_payment_error?.message || 'Payment failed',
          },
        });

        // Notify the customer
        await this.notificationsService.createNotification({
          userId: booking.userId,
          title: 'Payment Failed',
          message: `Your payment for ${booking.service.name} has failed. Reason: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`,
          notificationType: 'payment_confirmation',
          relatedBookingId: bookingId,
        });
      }
    }
  }

  private async handleSubscriptionCreated(subscription: any) {
    // The subscription metadata should contain our internal subscription ID
    if (subscription.metadata?.subscriptionId) {
      const subscriptionId = subscription.metadata.subscriptionId;

      // Update our subscription with the Stripe subscription ID
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          stripeSubscriptionId: subscription.id,
          status: this.mapStripeStatusToInternal(subscription.status),
        },
      });
    }
  }

  private async handleSubscriptionUpdated(subscription: any) {
    // Find our subscription by Stripe subscription ID
    const internalSubscription = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (internalSubscription) {
      // Update our subscription status
      await this.prisma.subscription.update({
        where: { id: internalSubscription.id },
        data: {
          status: this.mapStripeStatusToInternal(subscription.status),
        },
      });

      // If subscription canceled, update with cancellation details
      if (subscription.status === 'canceled') {
        await this.prisma.subscription.update({
          where: { id: internalSubscription.id },
          data: {
            status: 'canceled',
            cancellationReason: 'Canceled through Stripe',
          },
        });

        // Notify the user
        await this.notificationsService.createNotification({
          userId: internalSubscription.userId,
          title: 'Subscription Canceled',
          message: 'Your subscription has been canceled.',
          notificationType: 'status_change',
        });
      }
    }
  }

  private async handleSubscriptionDeleted(subscription: any) {
    // Find our subscription by Stripe subscription ID
    const internalSubscription = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (internalSubscription) {
      // Update our subscription status
      await this.prisma.subscription.update({
        where: { id: internalSubscription.id },
        data: {
          status: 'canceled',
          cancellationReason: 'Subscription deleted from Stripe',
        },
      });

      // Notify the user
      await this.notificationsService.createNotification({
        userId: internalSubscription.userId,
        title: 'Subscription Deleted',
        message: 'Your subscription has been deleted.',
        notificationType: 'status_change',
      });
    }
  }

  // Map Stripe subscription status to our internal status
  private mapStripeStatusToInternal(
    stripeStatus: string,
  ): 'active' | 'paused' | 'canceled' {
    switch (stripeStatus) {
      case 'active':
      case 'trialing':
        return 'active';
      case 'past_due':
      case 'unpaid':
      case 'incomplete':
      case 'incomplete_expired':
        return 'paused';
      case 'canceled':
        return 'canceled';
      default:
        return 'active';
    }
  }

  private async handleCheckoutSessionCompleted(session: any) {
    const subscriptionId = session.subscription;
    const customerEmail = session.customer_details.email;
    const internalSubId = session.metadata?.internalSubId;

    console.log(session);
    if (internalSubId) {
      await this.prisma.subscription.update({
        where: { id: internalSubId },
        data: {
          stripeSubscriptionId: subscriptionId,
          status: 'active',
        },
      });

      const bookingId = session.metadata.bookingId;
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          service: true,
          customer: true,
          bookingAddress: {
            include: { address: true },
          },
        },
      });

      await this.mailService.sendBookingConfirmationEmail(
        booking.customer.email,
        booking.customer.name,
        booking.service.name,
        booking.bookingAddress.address.line_1,
      );

      await this.notificationsService.createNotification({
        userId: session.metadata.userId,
        title: 'Subscription Activated',
        message: 'Your subscription has been successfully activated.',
        notificationType: NotificationType.payment_confirmation,
      });
    }
  }

  private async handleCheckoutSessionExpired(session: any) {
    const internalSubId = session.metadata?.subscriptionId;

    if (internalSubId) {
      await this.prisma.subscription.update({
        where: { id: internalSubId },
        data: {
          status: SubscriptionStatus.paused,
          cancellationReason: 'Checkout session expired',
        },
      });
    }
  }

  private async handleInvoicePaymentSucceeded(invoice: any) {
    const subscriptionId = invoice.subscription;

    const internalSub = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      include: {
        bookings: true,
      },
    });

    if (internalSub) {
      await this.prisma.transaction.create({
        data: {
          bookingId: internalSub.bookings[0]?.id ?? '', // optional: link a booking if relevant
          stripeInvoiceId: invoice.id,
          stripePaymentId: invoice.payment_intent as string,
          amount: new Prisma.Decimal(invoice.amount_paid / 100),
          currency: invoice.currency,
          status: TransactionStatus.successful,
          paymentMethod: invoice.payment_intent ? 'card' : 'unknown',
          transactionType: 'subscription_payment',
        },
      });

      await this.notificationsService.createNotification({
        userId: internalSub.userId,
        title: 'Subscription Renewal',
        message: `Your subscription has been successfully renewed.`,
        notificationType: 'payment_confirmation',
      });
    }
  }
}
