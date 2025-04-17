import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { BookingStatus, TransactionStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { ProcessRefundDto } from './dto/process-refund.dto';
import { StripeService } from 'src/stripe/stripe.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly stripeService: StripeService,
  ) {}

  async processRefund(processRefundDto: ProcessRefundDto, userId: string) {
    // Check if transaction exists
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: processRefundDto.transactionId },
      include: {
        booking: {
          include: {
            customer: true,
            service: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with ID ${processRefundDto.transactionId} not found`,
      );
    }

    // Check if transaction is successful (can only refund successful payments)
    if (transaction.status !== TransactionStatus.successful) {
      throw new BadRequestException(
        `Cannot refund a ${transaction.status} transaction`,
      );
    }

    // Check if refund already exists for this transaction
    const existingRefund = await this.prisma.transaction.findFirst({
      where: {
        transactionType: 'refund',
        stripePaymentId: transaction.stripePaymentId,
      },
    });

    if (existingRefund) {
      throw new BadRequestException(
        'Refund already processed for this transaction',
      );
    }

    try {
      // Process the refund through Stripe
      const refund = await this.stripeService.createRefund(
        transaction.stripePaymentId,
        processRefundDto.amount || undefined,
        processRefundDto.reason,
      );

      // Create refund transaction record
      const refundTransaction = await this.prisma.transaction.create({
        data: {
          bookingId: transaction.bookingId,
          stripePaymentId: transaction.stripePaymentId,
          stripeInvoiceId: transaction.stripeInvoiceId,
          amount: processRefundDto.amount || transaction.amount,
          currency: transaction.currency,
          status: TransactionStatus.successful,
          paymentMethod: transaction.paymentMethod,
          transactionType: 'refund',
        },
        include: {
          booking: {
            include: {
              service: true,
            },
          },
        },
      });

      // Notify customer
      await this.notificationsService.createNotification({
        userId: transaction.booking.userId,
        title: 'Refund Processed',
        message: `Your refund of $${processRefundDto.amount || transaction.amount} for ${transaction.booking.service.name} has been processed.`,
        notificationType: 'payment_confirmation',
        relatedBookingId: transaction.bookingId,
      });

      return {
        refundId: refund.id,
        transaction: refundTransaction,
      };
    } catch (error) {
      // Log the error
      console.error('Stripe refund error:', error);
      throw new BadRequestException(
        `Refund processing failed: ${error.message}`,
      );
    }
  }

  async getTransactions(userId: string, role: string) {
    let where = {};

    // If user is customer, filter by their bookings
    if (role === 'customer') {
      where = {
        booking: {
          userId,
        },
      };
    }
    // Admin sees all transactions

    return this.prisma.transaction.findMany({
      where,
      include: {
        booking: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
              },
            },
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getBookingTransactions(
    bookingId: string,
    userId: string,
    role: string,
  ) {
    // Check if booking exists
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${bookingId} not found`);
    }

    // Check if user has permission to view transactions for this booking
    if (role !== 'admin' && booking.userId !== userId) {
      throw new BadRequestException(
        'You can only view transactions for your own bookings',
      );
    }

    // Get transactions for booking
    return this.prisma.transaction.findMany({
      where: { bookingId },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getTransaction(id: string, userId: string, role: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
              },
            },
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    // Check if user has permission to view this transaction
    if (role !== 'admin' && transaction.booking.userId !== userId) {
      throw new BadRequestException('You can only view your own transactions');
    }

    return transaction;
  }

  async getUserTransactions(userId: string) {
    return this.prisma.transaction.findMany({
      where: {
        booking: {
          userId,
        },
      },
      include: {
        booking: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getStripeCustomerId(userId: string): Promise<string> {
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // If user already has a Stripe customer ID, return it
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    // Create a new Stripe customer
    const customer = await this.stripeService.createCustomer(
      user.email,
      user.name,
    );

    // Save the Stripe customer ID to the user
    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  async markAsSuccessfulByBookingId(
    bookingId: string,
    data: { stripeSubscriptionId?: string; stripePaymentIntentId?: string },
  ): Promise<void> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { bookingId, status: TransactionStatus.pending },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction not found for booking ID ${bookingId}`,
      );
    }

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: TransactionStatus.successful,
        // stripeSubscriptionId: data.stripeSubscriptionId ?? undefined,
        stripePaymentId: data.stripePaymentIntentId ?? undefined,
      },
    });

    // Optionally: Update booking status to 'paid'
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.booked },
    });
  }

  async saveTransaction(data: {
    bookingId: string;
    stripeInvoiceId?: string;
    stripePaymentId?: string;
    amount: number | string;
    currency: string;
    status: TransactionStatus;
    paymentMethod: string;
    transactionType: string;
    failureReason?: string;
  }) {
    return this.prisma.transaction.create({
      data: {
        bookingId: data.bookingId,
        stripeInvoiceId: data.stripeInvoiceId ?? null,
        stripePaymentId: data.stripePaymentId ?? null,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        paymentMethod: data.paymentMethod,
        transactionType: data.transactionType,
        failureReason: data.failureReason ?? null,
      },
    });
  }

  async processPayment(createPaymentDto: CreatePaymentDto, userId: string) {
    // Check if booking exists
    const booking = await this.prisma.booking.findUnique({
      where: { id: createPaymentDto.bookingId },
      include: {
        service: true,
        customer: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(
        `Booking with ID ${createPaymentDto.bookingId} not found`,
      );
    }

    // Check if booking belongs to user
    if (booking.userId !== userId) {
      throw new BadRequestException(
        'You can only process payments for your own bookings',
      );
    }

    // Check if payment already exists for this booking
    const existingPayment = await this.prisma.transaction.findFirst({
      where: {
        bookingId: createPaymentDto.bookingId,
        status: TransactionStatus.successful,
      },
    });

    if (existingPayment) {
      throw new BadRequestException(
        'Payment already processed for this booking',
      );
    }

    try {
      // Get or create Stripe customer
      let stripeCustomerId = await this.getStripeCustomerId(userId);

      // Create a payment intent - convert Decimal to number
      const bookingPrice = Number(booking.price);
      const paymentIntent = await this.stripeService.createPaymentIntent(
        bookingPrice,
        'usd', // assuming USD as the currency
        stripeCustomerId,
      );

      // Add metadata to the payment intent
      await this.stripeService.updatePaymentIntent(paymentIntent.id, {
        metadata: {
          bookingId: booking.id,
          userId: userId,
          serviceId: booking.serviceId,
        },
      });

      // Create pending transaction
      const transaction = await this.prisma.transaction.create({
        data: {
          bookingId: createPaymentDto.bookingId,
          stripePaymentId: paymentIntent.id,
          amount: bookingPrice,
          currency: 'usd',
          status: TransactionStatus.pending,
          paymentMethod: createPaymentDto.paymentMethod
            ? createPaymentDto.paymentMethod
            : 'online',
          transactionType: createPaymentDto.transactionType,
        },
        include: {
          booking: {
            include: {
              service: true,
            },
          },
        },
      });

      // Return the client secret for the frontend to complete the payment
      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        transaction,
      };
    } catch (error) {
      // Implementation continues...
    }
  }
}
