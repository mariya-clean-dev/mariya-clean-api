import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  Booking,
  BookingStatus,
  Prisma,
  RecurringType,
  ServiceType,
  TransactionStatus,
} from '@prisma/client';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { ResponseService } from 'src/response/response.service';
import { Public } from 'src/auth/decorators/public.decorator';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { UsersService } from 'src/users/users.service';
import { StripeService } from 'src/stripe/stripe.service';
import { PaymentsService } from 'src/payments/payments.service';
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service';
import { SchedulerService } from 'src/scheduler/scheduler.service';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly responseService: ResponseService,
    private readonly usersService: UsersService,
    private readonly stripeService: StripeService,
    private readonly paymentsService: PaymentsService,
    private readonly subscrptionService: SubscriptionsService,
    private readonly schedulerService: SchedulerService,
  ) {}

  @Post()
  @Public()
  async create(@Body() createBookingDto: CreateBookingDto) {
    const userData = {
      name: createBookingDto.name,
      email: createBookingDto.email,
      phone: createBookingDto.phone,
      role: 'customer',
    };

    const user = await this.usersService.findOrCreateUser(userData);
    const booking = await this.bookingsService.create(
      createBookingDto,
      user.id,
    );

    let stripeData = null;
    let transactionType: string;
    let stripeInvoiceId: string | null = null;
    let stripePaymentId: string | null = null;

    if (booking.type === 'instant') {
      const customer = await this.stripeService.createCustomer(
        createBookingDto.email,
        createBookingDto.name,
      );

      const paymentIntent = await this.stripeService.createPaymentIntent(
        Number(booking.price),
        'usd',
        customer.id,
      );

      stripeData = {
        customerId: customer.id,
        paymentIntent: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
      };

      transactionType = 'instant';
      stripePaymentId = paymentIntent.id;
    } else if (booking.type === 'subscription') {
      const customer = await this.stripeService.createCustomer(
        createBookingDto.email,
        createBookingDto.name,
      );

      const product = await this.stripeService.createProduct(
        `Subscription for Booking ${booking.id}`,
      );

      const price = await this.stripeService.createPrice(
        product.id,
        Number(booking.price),
        'usd',
        {
          interval: 'month',
          interval_count: 1,
        },
      );

      const session = await this.stripeService.createCheckoutSession({
        customer: customer.id,
        priceId: price.id,
        metadata: {
          bookingId: booking.id.toString(),
          userId: user.id.toString(),
        },
        successUrl: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${process.env.FRONTEND_URL}/payment-cancel`,
      });

      stripeData = {
        checkoutUrl: session.url,
      };

      transactionType = 'subscription';
    }
    // Save transaction
    await this.paymentsService.saveTransaction({
      bookingId: booking.id,
      stripeInvoiceId,
      stripePaymentId,
      amount: Number(booking.price),
      currency: 'usd',
      status: TransactionStatus.pending,
      paymentMethod: 'stripe',
      transactionType,
    });
    // Validate schedule dependencies
    if (booking.subscriptionType) {
      if (
        booking.subscriptionType.name === 'Bi-Weekly Plan' &&
        !createBookingDto.schedule_2
      ) {
        throw new ConflictException('Bi-Weekly Plan requires upto schedule 2');
      }

      if (
        booking.subscriptionType.name === 'Weekly Plan' &&
        !createBookingDto.schedule_4
      ) {
        throw new ConflictException('Weekly Plan requires upto schedule 4');
      }
      if (
        booking.subscriptionType.name === 'Monthly Plan' &&
        createBookingDto.schedule_2
      ) {
        throw new ConflictException('Multiple schedules found');
      }
    } else if (createBookingDto.schedule_2) {
      throw new ConflictException('Multiple schedules found');
    }
    const scheduleKeys = [
      'schedule_1',
      'schedule_2',
      'schedule_3',
      'schedule_4',
    ] as const;

    const monthSchedules = scheduleKeys
      .map((key) => {
        const schedule = createBookingDto[key];
        if (
          schedule &&
          typeof schedule.weekOfMonth === 'number' &&
          typeof schedule.dayOfWeek === 'number' &&
          typeof schedule.time === 'string'
        ) {
          return {
            bookingId: booking.id,
            ...schedule,
          };
        }
        return null;
      })
      .filter(Boolean); // remove nulls 

    await this.schedulerService.createMonthSchedules(monthSchedules);
    return this.responseService.successResponse(
      'Booking successfully saved... proceed to payment',
      {
        booking,
        stripe: stripeData,
      },
    );
  }

  @Get()
  async findAll(
    @Request() req,
    @Query('status') status?: BookingStatus,
    @Query('type') type?: ServiceType,
  ) {
    const param: Partial<Booking> = {};

    if (status) {
      param.status = status;
    }

    if (type) {
      param.type = type;
    }

    const bookings = await this.bookingsService.findAll(
      req.user.role,
      req.user.id,
      param,
    );
    return this.responseService.successResponse('Bookings list', bookings);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const booking = await this.bookingsService.findOne(
      id,
      req.user.id,
      req.user.role,
    );
    return this.responseService.successResponse('Booking details', booking);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateBookingDto: UpdateBookingDto,
    @Request() req,
  ) {
    return this.bookingsService.update(
      id,
      updateBookingDto,
      req.user.id,
      req.user.role,
    );
  }

  @Post(':id/assign')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async assignStaff(
    @Param('id') id: string,
    @Body() assignStaffDto: AssignStaffDto,
    @Request() req,
  ) {
    return this.bookingsService.assignStaff(
      id,
      assignStaffDto.staffId,
      req.user.id,
    );
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Request() req) {
    const data = await this.bookingsService.cancel(
      id,
      req.user.id,
      req.user.role,
    );
    return this.responseService.successResponse('Booking cancelled', data);
  }

  @Post(':id/review')
  @UseGuards(RolesGuard)
  @Roles('customer')
  async createReview(
    @Param('id') id: string,
    @Body() createReviewDto: CreateReviewDto,
    @Request() req,
  ) {
    return this.bookingsService.createReview(id, req.user.id, createReviewDto);
  }
}
