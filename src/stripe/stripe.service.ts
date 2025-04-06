import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly stripeClient: Stripe;

  constructor(private configService: ConfigService) {
    this.stripeClient = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2025-02-24.acacia',
      },
    );
  }

  // Add a method to get the Stripe client directly
  getStripeClient(): Stripe {
    return this.stripeClient;
  }

  // Create a setupIntent method instead of directly accessing the stripe client
  async createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
    return this.stripeClient.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
  }

  // Update payment intent
  async updatePaymentIntent(
    paymentIntentId: string,
    data: Stripe.PaymentIntentUpdateParams,
  ): Promise<Stripe.PaymentIntent> {
    return this.stripeClient.paymentIntents.update(paymentIntentId, data);
  }

  // Create a payment intent for one-time payments
  async createPaymentIntent(
    amount: number,
    currency: string = 'usd',
    customerId?: string,
  ): Promise<Stripe.PaymentIntent> {
    const paymentIntentData: Stripe.PaymentIntentCreateParams = {
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      payment_method_types: ['card'],
    };

    if (customerId) {
      paymentIntentData.customer = customerId;
    }

    return this.stripeClient.paymentIntents.create(paymentIntentData);
  }

  // Create a Stripe customer
  async createCustomer(email: string, name: string): Promise<Stripe.Customer> {
    return this.stripeClient.customers.create({
      email,
      name,
    });
  }

  // Retrieve a Stripe customer
  async getCustomer(customerId: string): Promise<Stripe.Customer> {
    return this.stripeClient.customers.retrieve(
      customerId,
    ) as Promise<Stripe.Customer>;
  }

  // Update a Stripe customer
  async updateCustomer(
    customerId: string,
    updateData: Stripe.CustomerUpdateParams,
  ): Promise<Stripe.Customer> {
    return this.stripeClient.customers.update(customerId, updateData);
  }

  // Add a payment method to a customer
  async attachPaymentMethod(
    customerId: string,
    paymentMethodId: string,
  ): Promise<Stripe.PaymentMethod> {
    return this.stripeClient.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  // Set a payment method as default for a customer
  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string,
  ): Promise<Stripe.Customer> {
    return this.stripeClient.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  // Retrieve customer's payment methods - fix the type parameter
  async listPaymentMethods(
    customerId: string,
    type: Stripe.PaymentMethodListParams.Type = 'card',
  ): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
    return this.stripeClient.paymentMethods.list({
      customer: customerId,
      type,
    });
  }

  async createCheckoutSession({
    customer,
    priceId,
    metadata,
    successUrl,
    cancelUrl,
  }: {
    customer: string;
    priceId: string;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
  }) {
    return await this.stripeClient.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  // Create a subscription
  async createSubscription(
    customerId: string,
    priceId: string,
    paymentMethodId?: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.Subscription> {
    // If a payment method is provided, make sure it's attached to the customer
    if (paymentMethodId) {
      await this.attachPaymentMethod(customerId, paymentMethodId);
      await this.setDefaultPaymentMethod(customerId, paymentMethodId);
    }

    return this.stripeClient.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      expand: ['latest_invoice.payment_intent'],
      metadata,
    });
  }

  // Update a subscription
  async updateSubscription(
    subscriptionId: string,
    updateData: Stripe.SubscriptionUpdateParams,
  ): Promise<Stripe.Subscription> {
    return this.stripeClient.subscriptions.update(subscriptionId, updateData);
  }

  // Cancel a subscription
  async cancelSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    return this.stripeClient.subscriptions.cancel(subscriptionId);
  }

  // Pause a subscription
  async pauseSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    return this.stripeClient.subscriptions.update(subscriptionId, {
      pause_collection: {
        behavior: 'mark_uncollectible',
      },
    });
  }

  // Resume a subscription
  async resumeSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    return this.stripeClient.subscriptions.update(subscriptionId, {
      pause_collection: '',
    });
  }

  // Process a refund
  async createRefund(
    paymentIntentId: string,
    amount?: number,
    reason?: string,
  ): Promise<Stripe.Refund> {
    const refundData: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
      reason:
        (reason as Stripe.RefundCreateParams.Reason) || 'requested_by_customer',
    };

    if (amount) {
      refundData.amount = Math.round(amount * 100); // Convert to cents
    }

    return this.stripeClient.refunds.create(refundData);
  }

  // Create a product in Stripe (for subscription plans)
  async createProduct(
    name: string,
    description?: string,
  ): Promise<Stripe.Product> {
    return this.stripeClient.products.create({
      name,
      description,
    });
  }

  // Create a price for a product - Fix the recurring type
  async createPrice(
    productId: string,
    unitAmount: number,
    currency: string = 'usd',
    recurring?: {
      interval: Stripe.PriceCreateParams.Recurring.Interval;
      interval_count: number;
    },
  ): Promise<Stripe.Price> {
    const priceData: Stripe.PriceCreateParams = {
      product: productId,
      unit_amount: Math.round(unitAmount * 100), // Convert to cents
      currency,
    };

    if (recurring) {
      priceData.recurring = recurring;
    }

    return this.stripeClient.prices.create(priceData);
  }

  // Webhook signature verification
  verifyWebhookSignature(
    payload: Buffer,
    signature: string,
    webhookSecret: string,
  ): Stripe.Event {
    return this.stripeClient.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }
}
