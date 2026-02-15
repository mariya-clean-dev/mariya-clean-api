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

  async sendPaymentUpdateEmail(to: string, name: string, url: string) {
    try {
      const result = await this.mailerService.sendMail({
        to,
        subject: 'Update Your Payment Method - Clean By Maria',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Hello ${name},</h2>
            <p>You requested to update your payment method for your Clean By Maria booking.</p>
            <p>Please click the button below to securely update your payment details via Stripe:</p>
            <a href="${url}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Update Payment Method</a>
            <p>If you did not request this, please ignore this email.</p>
            <p>Best regards,<br>The Clean By Maria Team</p>
          </div>
        `,
      });
      console.log('Payment update email sent:', result);
      return { success: true, result };
    } catch (error) {
      console.error('Payment update email failed:', error);
      return { success: false, error: error.message };
    }
  }
}
