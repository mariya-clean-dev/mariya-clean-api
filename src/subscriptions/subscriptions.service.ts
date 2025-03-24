import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { StripeService } from 'src/stripe/stripe.service';
import { PaymentsService } from 'src/payments/payments.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async create(createSubscriptionDto: CreateSubscriptionDto, userId: string) {
    // Check if service exists
    const service = await this.prisma.service.findUnique({
      where: { id: createSubscriptionDto.serviceId },
    });

    if (!service) {
      throw new NotFoundException(
        `Service with ID ${createSubscriptionDto.serviceId} not found`,
      );
    }

    // Check if the service has a Stripe product and price
    let stripeProductId = service.stripeProductId;
    let stripePriceId = service.stripePriceId;

    // Create Stripe product and price if they don't exist
    if (!stripeProductId) {
      const product = await this.stripeService.createProduct(
        service.name,
        service.description,
      );
      stripeProductId = product.id;

      // Update service with Stripe product ID
      await this.prisma.service.update({
        where: { id: service.id },
        data: { stripeProductId },
      });
    }

    if (!stripePriceId) {
      // Get base price for the service
      const basePlan = await this.prisma.basePlan.findFirst({
        where: {
          serviceId: service.id,
          // Add any other criteria for selecting the appropriate base plan
        },
      });

      if (!basePlan) {
        throw new BadRequestException('No pricing found for this service');
      }

      // Determine the recurring interval based on the DTO
      let interval: 'day' | 'week' | 'month' | 'year';
      let intervalCount: number;

      switch (createSubscriptionDto.recurringType) {
        case 'daily':
          interval = 'day';
          intervalCount = createSubscriptionDto.recurringFrequency;
          break;
        case 'weekly':
          interval = 'week';
          intervalCount = createSubscriptionDto.recurringFrequency;
          break;
        case 'bi_weekly':
          interval = 'week';
          intervalCount = createSubscriptionDto.recurringFrequency * 2;
          break;
        case 'monthly':
        default:
          interval = 'month';
          intervalCount = createSubscriptionDto.recurringFrequency;
          break;
      }

      // Create price in Stripe
      const price = await this.stripeService.createPrice(
        stripeProductId,
        Number(basePlan.price),
        basePlan.currency || 'usd',
        { interval, interval_count: intervalCount },
      );
      stripePriceId = price.id;

      // Update service with Stripe price ID
      await this.prisma.service.update({
        where: { id: service.id },
        data: { stripePriceId },
      });
    }

    // Calculate next billing date
    const startDate = new Date(createSubscriptionDto.startDate);
    const nextBillingDate = this.calculateNextBillingDate(
      startDate,
      createSubscriptionDto.recurringType,
      createSubscriptionDto.recurringFrequency,
    );

    // Create subscription in our database first
    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        serviceId: createSubscriptionDto.serviceId,
        status: SubscriptionStatus.active,
        recurringType: createSubscriptionDto.recurringType,
        recurringFrequency: createSubscriptionDto.recurringFrequency,
        startDate,
        nextBillingDate,
        stripeSubscriptionId:
          createSubscriptionDto.stripeSubscriptionId || null,
      },
      include: {
        service: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    try {
      // Get or create Stripe customer
      let stripeCustomerId =
        await this.paymentsService.getStripeCustomerId(userId);

      // Create subscription in Stripe
      const stripeSubscription = await this.stripeService.createSubscription(
        stripeCustomerId,
        stripePriceId,
        createSubscriptionDto.paymentMethodId,
        { subscriptionId: subscription.id }, // Add our ID as metadata
      );

      // Update our subscription with Stripe subscription ID
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          stripeSubscriptionId: stripeSubscription.id,
        },
      });

      // Notify user
      await this.notificationsService.createNotification({
        userId,
        title: 'Subscription Created',
        message: `Your subscription to ${service.name} has been created successfully.`,
        notificationType: 'status_change',
      });

      return {
        ...subscription,
        stripeSubscriptionId: stripeSubscription.id,
        clientSecret: (stripeSubscription as any).latest_invoice?.payment_intent
          ?.client_secret,
      };
    } catch (error) {
      // If Stripe subscription creation fails, mark our subscription as canceled
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.canceled,
          cancellationReason: `Failed to create Stripe subscription: ${error.message}`,
        },
      });

      throw new BadRequestException(
        `Subscription creation failed: ${error.message}`,
      );
    }
  }

  // Update methods to use Stripe...

  async cancel(id: string, userId: string, reason: string) {
    // Check if subscription exists and belongs to user
    const subscription = await this.findOne(id, userId);

    // Check if subscription is not already canceled
    if (subscription.status === SubscriptionStatus.canceled) {
      throw new BadRequestException('Subscription is already canceled');
    }

    try {
      // Cancel subscription in Stripe if it exists
      if (subscription.stripeSubscriptionId) {
        await this.stripeService.cancelSubscription(
          subscription.stripeSubscriptionId,
        );
      }

      // Update subscription status in our database
      const updatedSubscription = await this.prisma.subscription.update({
        where: { id },
        data: {
          status: SubscriptionStatus.canceled,
          cancellationReason: reason,
        },
        include: {
          service: true,
        },
      });

      // Notify user
      await this.notificationsService.createNotification({
        userId,
        title: 'Subscription Canceled',
        message: `Your subscription to ${subscription.service.name} has been canceled.`,
        notificationType: 'status_change',
      });

      // Notify admin
      // This would typically use an admin user ID in production
      await this.notificationsService.createNotification({
        userId, // This should be admin ID in production
        title: 'Subscription Canceled',
        message: `A subscription has been canceled. Reason: ${reason}`,
        notificationType: 'status_change',
      });

      return updatedSubscription;
    } catch (error) {
      throw new BadRequestException(
        `Failed to cancel subscription: ${error.message}`,
      );
    }
  }

  async pause(id: string, userId: string) {
    // Check if subscription exists and belongs to user
    const subscription = await this.findOne(id, userId);

    // Check if subscription is active
    if (subscription.status !== SubscriptionStatus.active) {
      throw new BadRequestException(
        `Cannot pause a ${subscription.status} subscription`,
      );
    }

    try {
      // Pause subscription in Stripe if it exists
      if (subscription.stripeSubscriptionId) {
        await this.stripeService.pauseSubscription(
          subscription.stripeSubscriptionId,
        );
      }
      // Update subscription status
      const updatedSubscription = await this.prisma.subscription.update({
        where: { id },
        data: {
          status: SubscriptionStatus.paused,
        },
        include: {
          service: true,
        },
      });

      // Notify user
      await this.notificationsService.createNotification({
        userId,
        title: 'Subscription Paused',
        message: `Your subscription to ${subscription.service.name} has been paused.`,
        notificationType: 'status_change',
      });

      return updatedSubscription;
    } catch (error) {
      throw new BadRequestException(
        `Failed to pause subscription: ${error.message}`,
      );
    }
  }

  async resume(id: string, userId: string) {
    // Check if subscription exists and belongs to user
    const subscription = await this.findOne(id, userId);

    // Check if subscription is paused
    if (subscription.status !== SubscriptionStatus.paused) {
      throw new BadRequestException(
        `Cannot resume a ${subscription.status} subscription`,
      );
    }

    try {
      // Resume subscription in Stripe if it exists
      if (subscription.stripeSubscriptionId) {
        await this.stripeService.resumeSubscription(
          subscription.stripeSubscriptionId,
        );
      }

      // Update subscription status
      const updatedSubscription = await this.prisma.subscription.update({
        where: { id },
        data: {
          status: SubscriptionStatus.active,
        },
        include: {
          service: true,
        },
      });

      // Notify user
      await this.notificationsService.createNotification({
        userId,
        title: 'Subscription Resumed',
        message: `Your subscription to ${subscription.service.name} has been resumed.`,
        notificationType: 'status_change',
      });

      return updatedSubscription;
    } catch (error) {
      throw new BadRequestException(
        `Failed to resume subscription: ${error.message}`,
      );
    }
  }

  //old code below

  async findAll(userId?: string) {
    // If userId provided, filter by user
    const where = userId ? { userId } : {};

    return this.prisma.subscription.findMany({
      where,
      include: {
        service: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, userId?: string) {
    // Build where clause
    const where: any = { id };
    if (userId) {
      where.userId = userId;
    }

    const subscription = await this.prisma.subscription.findFirst({
      where,
      include: {
        service: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        bookings: {
          select: {
            id: true,
            status: true,
            schedules: true, // Changed from scheduledAt
          },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    return subscription;
  }

  async update(
    id: string,
    updateSubscriptionDto: UpdateSubscriptionDto,
    userId?: string,
  ) {
    // Check if subscription exists
    const subscription = await this.findOne(id, userId);

    // Prepare data for update
    const updateData: any = {};

    // Handle status change
    if (updateSubscriptionDto.status) {
      updateData.status = updateSubscriptionDto.status;

      // If canceling, require reason
      if (
        updateSubscriptionDto.status === SubscriptionStatus.canceled &&
        !updateSubscriptionDto.cancellationReason
      ) {
        throw new BadRequestException('Cancellation reason is required');
      }

      // If canceling, set cancellation reason
      if (updateSubscriptionDto.status === SubscriptionStatus.canceled) {
        updateData.cancellationReason =
          updateSubscriptionDto.cancellationReason;
      }

      // If reactivating a canceled subscription, clear cancellation reason
      if (
        subscription.status === SubscriptionStatus.canceled &&
        updateSubscriptionDto.status === SubscriptionStatus.active
      ) {
        updateData.cancellationReason = null;
      }
    }

    // Handle recurring type and frequency changes
    if (
      updateSubscriptionDto.recurringType ||
      updateSubscriptionDto.recurringFrequency
    ) {
      // Only allowed if subscription is active
      if (subscription.status !== SubscriptionStatus.active) {
        throw new ForbiddenException(
          `Cannot update recurring settings for a ${subscription.status} subscription`,
        );
      }

      if (updateSubscriptionDto.recurringType) {
        updateData.recurringType = updateSubscriptionDto.recurringType;
      }

      if (updateSubscriptionDto.recurringFrequency) {
        updateData.recurringFrequency =
          updateSubscriptionDto.recurringFrequency;
      }

      // If either changes, recalculate next billing date
      const recurringType =
        updateSubscriptionDto.recurringType || subscription.recurringType;
      const recurringFrequency =
        updateSubscriptionDto.recurringFrequency ||
        subscription.recurringFrequency;

      // Use current next billing date as the base for calculation
      updateData.nextBillingDate = this.calculateNextBillingDate(
        subscription.nextBillingDate,
        recurringType,
        recurringFrequency,
      );
    }

    // Handle Stripe subscription ID update
    if (updateSubscriptionDto.stripeSubscriptionId) {
      updateData.stripeSubscriptionId =
        updateSubscriptionDto.stripeSubscriptionId;
    }

    // Update subscription
    const updatedSubscription = await this.prisma.subscription.update({
      where: { id },
      data: updateData,
      include: {
        service: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // If status changed, notify user
    if (
      updateSubscriptionDto.status &&
      updateSubscriptionDto.status !== subscription.status
    ) {
      await this.notificationsService.createNotification({
        userId: subscription.userId,
        title: 'Subscription Status Changed',
        message: `Your subscription status has been changed to ${updateSubscriptionDto.status}.`,
        notificationType: 'status_change',
      });
    }

    return updatedSubscription;
  }

  async remove(id: string, userId?: string) {
    // Check if subscription exists
    const subscription = await this.findOne(id, userId);

    // Delete subscription
    await this.prisma.subscription.delete({
      where: { id },
    });

    // Notify user
    await this.notificationsService.createNotification({
      userId: subscription.userId,
      title: 'Subscription Deleted',
      message: `Your subscription to ${subscription.service.name} has been deleted.`,
      notificationType: 'status_change',
    });

    return { message: 'Subscription successfully deleted' };
  }

  /**
   * Calculate the next billing date based on recurring type and frequency
   */
  private calculateNextBillingDate(
    baseDate: Date,
    recurringType: string,
    recurringFrequency: number,
  ): Date {
    const nextDate = new Date(baseDate);

    switch (recurringType) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + recurringFrequency);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + recurringFrequency * 7);
        break;
      case 'bi_weekly':
        nextDate.setDate(nextDate.getDate() + recurringFrequency * 14);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + recurringFrequency);
        break;
      default:
        throw new BadRequestException(
          `Unsupported recurring type: ${recurringType}`,
        );
    }

    return nextDate;
  }
}
