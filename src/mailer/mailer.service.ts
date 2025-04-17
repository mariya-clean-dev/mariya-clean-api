import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendWelcomeEmail(to: string, name: string) {
    await this.mailerService.sendMail({
      to,
      subject: 'Welcome!',
      template: 'welcome', // e.g. templates/welcome.hbs
      context: { name },
    });
  }

  async sendOtpEmail(to: string, name: string, otp: string, expiry = 10) {
    try {
      const result = await this.mailerService.sendMail({
        to,
        subject: 'Your OTP Code',
        template: 'otp',
        context: {
          name,
          otp,
          expiry,
          appName: 'Clean By Maria',
        },
      });
      console.log('Email sent:', result);
      return { success: true, result };
    } catch (error) {
      console.error('Email sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  async sendBookingConfirmationEmail(
    to: string,
    customerName: string,
    serviceName: string,
    address: string,
    specialInstructions?: string,
  ) {
    try {
      const result = await this.mailerService.sendMail({
        to,
        subject: 'Booking Confirmed – Clean By Maria',
        template: 'booking-confirmation', // views/booking-confirmation.hbs
        context: {
          customerName,
          serviceName,
          address,
          specialInstructions,
        },
      });
      console.log('Booking confirmation sent:', result);
      return { success: true, result };
    } catch (error) {
      console.error('Booking confirmation failed:', error);
      return { success: false, error: error.message };
    }
  }
}
