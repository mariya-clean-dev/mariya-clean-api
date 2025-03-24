import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProcessRefundDto } from './dto/process-refund.dto';
import { StripeService } from 'src/stripe/stripe.service';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly stripeService: StripeService,
  ) {}

  @Post('process')
  @UseGuards(RolesGuard)
  @Roles('customer')
  processPayment(@Body() createPaymentDto: CreatePaymentDto, @Request() req) {
    return this.paymentsService.processPayment(createPaymentDto, req.user.id);
  }

  @Post('refund')
  @UseGuards(RolesGuard)
  @Roles('admin')
  processRefund(@Body() processRefundDto: ProcessRefundDto, @Request() req) {
    return this.paymentsService.processRefund(processRefundDto, req.user.id);
  }

  @Get()
  getTransactions(@Request() req) {
    return this.paymentsService.getTransactions(req.user.id, req.user.role);
  }

  @Get('booking/:id')
  getBookingTransactions(@Param('id') id: string, @Request() req) {
    return this.paymentsService.getBookingTransactions(
      id,
      req.user.id,
      req.user.role,
    );
  }

  @Get(':id')
  getTransaction(@Param('id') id: string, @Request() req) {
    return this.paymentsService.getTransaction(id, req.user.id, req.user.role);
  }

  @Get('user/transactions')
  @UseGuards(RolesGuard)
  @Roles('customer')
  getUserTransactions(@Request() req) {
    return this.paymentsService.getUserTransactions(req.user.id);
  }

  @Post('methods')
  async createPaymentMethod(
    @Body() data: { paymentMethodId: string },
    @Request() req,
  ) {
    try {
      // Get or create Stripe customer ID
      const stripeCustomerId = await this.paymentsService.getStripeCustomerId(
        req.user.id,
      );

      // Attach payment method to customer
      const paymentMethod = await this.stripeService.attachPaymentMethod(
        stripeCustomerId,
        data.paymentMethodId,
      );

      // Set as default payment method
      await this.stripeService.setDefaultPaymentMethod(
        stripeCustomerId,
        data.paymentMethodId,
      );

      return { success: true, paymentMethod };
    } catch (error) {
      throw new BadRequestException(
        `Failed to add payment method: ${error.message}`,
      );
    }
  }

  @Get('methods')
  async getPaymentMethods(@Request() req) {
    try {
      // Get Stripe customer ID
      const stripeCustomerId = await this.paymentsService.getStripeCustomerId(
        req.user.id,
      );

      // Get payment methods
      const paymentMethods =
        await this.stripeService.listPaymentMethods(stripeCustomerId);

      return paymentMethods;
    } catch (error) {
      throw new BadRequestException(
        `Failed to get payment methods: ${error.message}`,
      );
    }
  }

  @Post('setup-intent')
  async createSetupIntent(@Request() req) {
    try {
      // Get or create Stripe customer ID
      const stripeCustomerId = await this.paymentsService.getStripeCustomerId(
        req.user.id,
      );

      // Create setup intent using the proper method
      const setupIntent =
        await this.stripeService.createSetupIntent(stripeCustomerId);

      return { clientSecret: setupIntent.client_secret };
    } catch (error) {
      throw new BadRequestException(
        `Failed to create setup intent: ${error.message}`,
      );
    }
  }
}
