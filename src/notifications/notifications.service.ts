import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationType } from '@prisma/client';
import { FirebaseService } from '../firebase/firebase.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseService: FirebaseService,
  ) { }

  async createNotification(createNotificationDto: CreateNotificationDto) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: createNotificationDto.userId },
    });

    if (!user) {
      throw new NotFoundException(
        `User with ID ${createNotificationDto.userId} not found`,
      );
    }

    // If booking ID is provided, check if it exists
    if (createNotificationDto.relatedBookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: createNotificationDto.relatedBookingId },
      });

      if (!booking) {
        throw new NotFoundException(
          `Booking with ID ${createNotificationDto.relatedBookingId} not found`,
        );
      }
    }

    // Create notification in database
    const notification = await this.prisma.notification.create({
      data: {
        userId: createNotificationDto.userId,
        title: createNotificationDto.title,
        message: createNotificationDto.message,
        notificationType: createNotificationDto.notificationType,
        relatedBookingId: createNotificationDto.relatedBookingId,
      },
    });

    // Send push notification via Firebase if user has FCM token
    // Note: This assumes the User model has an fcmToken field
    // If not present in schema, this will gracefully skip the push notification
    try {
      if (user['fcmToken']) {
        await this.firebaseService.sendNotification({
          token: user['fcmToken'],
          notification: {
            title: createNotificationDto.title,
            body: createNotificationDto.message,
          },
          data: {
            notificationType: createNotificationDto.notificationType,
            ...(createNotificationDto.relatedBookingId && {
              bookingId: createNotificationDto.relatedBookingId,
            }),
          },
        });
      }
    } catch (error) {
      // Log error but don't fail the notification creation
      console.error('Failed to send push notification:', error);
    }

    return notification;
  }

  async findAllForUser(userId: string) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Get notifications for user
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            service: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async findOne(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            service: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    // Check if notification belongs to user
    if (notification.userId !== userId) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    return notification;
  }

  async markAsRead(id: string, userId: string) {
    // Check if notification exists and belongs to user
    await this.findOne(id, userId);

    // Update notification
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Update all unread notifications for user
    await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return { message: 'All notifications marked as read' };
  }

  async remove(id: string, userId: string) {
    // Check if notification exists and belongs to user
    await this.findOne(id, userId);

    // Delete notification
    await this.prisma.notification.delete({
      where: { id },
    });

    return { message: 'Notification deleted' };
  }

  async getUnreadCount(userId: string) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Count unread notifications
    const count = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return { count };
  }

  /**
   * Cron job: Send daily morning notifications to customers about their schedules
   * Runs every day at 8:00 AM
   */
  @Cron('0 8 * * *', {
    timeZone: 'America/New_York',
  })
    async sendDailyCustomerNotifications() {
      this.logger.log('🔔 Running daily customer notifications job...');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      try {
        // Get all schedules for today that are scheduled or in progress
        const todaySchedules = await this.prisma.schedule.findMany({
          where: {
            startTime: {
              gte: today,
              lt: tomorrow,
            },
            status: {
              in: ['scheduled', 'payment_success'],
            },
            isSkipped: false,
          },
          include: {
            booking: {
              include: {
                customer: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    fcmToken: true,
                  },
                },
                service: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            staff: {
              select: {
                name: true,
              },
            },
          },
        });

        this.logger.log(`📅 Found ${todaySchedules.length} schedules for today`);

        // Group schedules by customer
        const customerSchedules = new Map<string, any[]>();
        todaySchedules.forEach((schedule) => {
          const customerId = schedule.booking.customer.id;
          if (!customerSchedules.has(customerId)) {
            customerSchedules.set(customerId, []);
          }
          customerSchedules.get(customerId).push(schedule);
        });

        // Send notifications to each customer
        for (const [customerId, schedules] of customerSchedules) {
          const customer = schedules[0].booking.customer;
          const schedule = schedules[0]; // Get first schedule for time info

          const timeStr = new Date(schedule.startTime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });

          const title = 'Reminder: Cleaning Scheduled Today';
          const message = schedules.length === 1
            ? `You have a ${schedule.booking.service.name} scheduled today at ${timeStr}${schedule.staff ? ` with ${schedule.staff.name}` : ''}.`
            : `You have ${schedules.length} cleaning sessions scheduled for today. First one at ${timeStr}.`;

          // Create notification
          await this.createNotification({
            userId: customerId,
            title,
            message,
            notificationType: 'booking_reminder',
            relatedBookingId: schedule.booking.id,
          });

          this.logger.log(`✅ Sent reminder to customer ${customer.name}`);
        }

        this.logger.log('✅ Daily customer notifications completed');
      } catch (error) {
        this.logger.error(`❌ Error sending daily customer notifications: ${error.message}`);
      }
    }

    /**
     * Cron job: Send daily morning notifications to staff about their schedules
     * Runs every day at 7:00 AM
     */
    @Cron('0 7 * * *', {
      timeZone: 'America/New_York',
    })
    async sendDailyStaffNotifications() {
      this.logger.log('🔔 Running daily staff notifications job...');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      try {
        // Get all schedules for today grouped by staff
        const todaySchedules = await this.prisma.schedule.findMany({
          where: {
            startTime: {
              gte: today,
              lt: tomorrow,
            },
            status: {
              in: ['scheduled', 'payment_success'],
            },
            isSkipped: false,
            staffId: {
              not: null,
            },
          },
          include: {
            staff: {
              select: {
                id: true,
                name: true,
                email: true,
                fcmToken: true,
              },
            },
            booking: {
              include: {
                service: {
                  select: {
                    name: true,
                  },
                },
                bookingAddress: {
                  include: {
                    address: {
                      select: {
                        city: true,
                        zip: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            startTime: 'asc',
          },
        });

        this.logger.log(`📅 Found ${todaySchedules.length} schedules for today`);

        // Group schedules by staff
        const staffSchedules = new Map<string, any[]>();
        todaySchedules.forEach((schedule) => {
          const staffId = schedule.staffId;
          if (!staffSchedules.has(staffId)) {
            staffSchedules.set(staffId, []);
          }
          staffSchedules.get(staffId).push(schedule);
        });

        // Send notifications to each staff member
        for (const [staffId, schedules] of staffSchedules) {
          const staff = schedules[0].staff;
          const count = schedules.length;

          const firstScheduleTime = new Date(schedules[0].startTime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });

          const title = `Today's Schedule: ${count} ${count === 1 ? 'Booking' : 'Bookings'}`;
          const message = count === 1
            ? `You have 1 booking scheduled today at ${firstScheduleTime} - ${schedules[0].booking.service.name}.`
            : `You have ${count} bookings scheduled today. First one at ${firstScheduleTime}.`;

          // Create notification
          await this.createNotification({
            userId: staffId,
            title,
            message,
            notificationType: 'booking_reminder',
          });

          this.logger.log(`✅ Sent schedule summary to staff ${staff.name} (${count} bookings)`);
        }

        this.logger.log('✅ Daily staff notifications completed');
      } catch (error) {
        this.logger.error(`❌ Error sending daily staff notifications: ${error.message}`);
      }
    }

    /**
     * Send notification when schedule status changes
     */
    async notifyScheduleStatusChange(
      scheduleId: string,
      oldStatus: string,
      newStatus: string,
    ) {
      try {
        const schedule = await this.prisma.schedule.findUnique({
          where: { id: scheduleId },
          include: {
            booking: {
              include: {
                customer: {
                  select: {
                    id: true,
                    name: true,
                    fcmToken: true,
                  },
                },
                service: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            staff: {
              select: {
                id: true,
                name: true,
                fcmToken: true,
              },
            },
          },
        });

        if (!schedule) return;

        const timeStr = new Date(schedule.startTime).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        const dateStr = new Date(schedule.startTime).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });

        // Notify customer
        let customerTitle = '';
        let customerMessage = '';

        switch (newStatus) {
          case 'completed':
            customerTitle = 'Service Completed';
            customerMessage = `Your ${schedule.booking.service.name} scheduled for ${dateStr} at ${timeStr} has been completed.`;
            break;
          case 'in_progress':
            customerTitle = 'Service Started';
            customerMessage = `Your ${schedule.booking.service.name} service has started.`;
            break;
          case 'canceled':
            customerTitle = 'Service Canceled';
            customerMessage = `Your ${schedule.booking.service.name} scheduled for ${dateStr} at ${timeStr} has been canceled.`;
            break;
          case 'payment_success':
            customerTitle = 'Payment Confirmed';
            customerMessage = `Payment confirmed for your ${schedule.booking.service.name} on ${dateStr}.`;
            break;
          case 'payment_failed':
            customerTitle = 'Payment Failed';
            customerMessage = `Payment failed for your ${schedule.booking.service.name} on ${dateStr}. Please update your payment method.`;
            break;
        }

        if (customerTitle) {
          await this.createNotification({
            userId: schedule.booking.customer.id,
            title: customerTitle,
            message: customerMessage,
            notificationType: 'status_change',
            relatedBookingId: schedule.booking.id,
          });
        }

        // Notify staff if assigned
        if (schedule.staff && ['canceled', 'rescheduled'].includes(newStatus)) {
          const staffTitle = newStatus === 'canceled' ? 'Schedule Canceled' : 'Schedule Changed';
          const staffMessage = `Your scheduled ${schedule.booking.service.name} for ${dateStr} at ${timeStr} has been ${newStatus}.`;

          await this.createNotification({
            userId: schedule.staff.id,
            title: staffTitle,
            message: staffMessage,
            notificationType: 'status_change',
            relatedBookingId: schedule.booking.id,
          });
        }

        this.logger.log(`✅ Status change notifications sent for schedule ${scheduleId}`);
      } catch (error) {
        this.logger.error(`❌ Error sending status change notification: ${error.message}`);
      }
    }

    /**
     * Send notifications when booking is rescheduled
     */
    async notifyReschedule(
      oldScheduleId: string,
      newScheduleId: string,
      bookingId: string,
    ) {
      try {
        const [oldSchedule, newSchedule, booking] = await Promise.all([
          this.prisma.schedule.findUnique({
            where: { id: oldScheduleId },
            include: { staff: true },
          }),
          this.prisma.schedule.findUnique({
            where: { id: newScheduleId },
            include: { staff: true },
          }),
          this.prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
              customer: true,
              service: true,
            },
          }),
        ]);

        if (!oldSchedule || !newSchedule || !booking) return;

        const newTimeStr = new Date(newSchedule.startTime).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        const newDateStr = new Date(newSchedule.startTime).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });

        // Notify customer
        await this.createNotification({
          userId: booking.customer.id,
          title: 'Booking Rescheduled',
          message: `Your ${booking.service.name} has been rescheduled to ${newDateStr} at ${newTimeStr}.`,
          notificationType: 'status_change',
          relatedBookingId: bookingId,
        });

        // Notify old staff (if different from new staff)
        if (oldSchedule.staff && oldSchedule.staffId !== newSchedule.staffId) {
          await this.createNotification({
            userId: oldSchedule.staffId,
            title: 'Schedule Removed',
            message: `A ${booking.service.name} booking previously assigned to you has been rescheduled to another staff member.`,
            notificationType: 'status_change',
            relatedBookingId: bookingId,
          });
        }

        // Notify new staff
        if (newSchedule.staff) {
          await this.createNotification({
            userId: newSchedule.staffId,
            title: 'New Schedule Assigned',
            message: `You have been assigned to a ${booking.service.name} booking on ${newDateStr} at ${newTimeStr}.`,
            notificationType: 'new_assignment',
            relatedBookingId: bookingId,
          });
        }

        this.logger.log(`✅ Reschedule notifications sent for booking ${bookingId}`);
      } catch (error) {
        this.logger.error(`❌ Error sending reschedule notification: ${error.message}`);
      }
    }
    return { count };
  }
}
