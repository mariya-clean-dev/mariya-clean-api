import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { BookingStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import dayjs from 'dayjs';
import { RescheduleDto } from './dto/reschedule.dto';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(createBookingDto: CreateBookingDto, userId: string) {
    let updatedPrice = createBookingDto.price;

    // if (createBookingDto.materialProvided == true) {
    //   updatedPrice = updatedPrice * 0.95; // 5% discount
    // }
    // if (createBookingDto.isEco == true) {
    //   updatedPrice = updatedPrice * 1.05; // 5% surcharge
    // }

    // Check if service exists
    const service = await this.prisma.service.findUnique({
      where: { id: createBookingDto.serviceId },
    });

    if (!service) {
      throw new NotFoundException(
        `Service with ID ${createBookingDto.serviceId} not found`,
      );
    }
    let recurringType;
    if (createBookingDto.recurringTypeId) {
      recurringType = await this.prisma.recurringType.findUnique({
        where: { id: createBookingDto.recurringTypeId },
      });

      if (!recurringType) {
        throw new NotFoundException(`plan type not found`);
      }
    }

    // If subscription is provided, check if it exists and belongs to user
    if (createBookingDto.subscriptionId) {
      const subscription = await this.prisma.subscription.findFirst({
        where: {
          id: createBookingDto.subscriptionId,
          userId,
        },
      });

      if (!subscription) {
        throw new NotFoundException(
          `Subscription with ID ${createBookingDto.subscriptionId} not found or doesn't belong to user`,
        );
      }

      // Check subscription status
      if (subscription.status !== 'active') {
        throw new BadRequestException(`Subscription is not active`);
      }
    }

    const formattedAddress = {
      line_1: createBookingDto.address.addressLine1,
      line_2: createBookingDto.address.addressLine2,
    };
    const specialInstructions = createBookingDto.address.specialInstructions;

    delete createBookingDto.address.specialInstructions;
    delete createBookingDto.address.addressLine1;
    delete createBookingDto.address.addressLine2;
    const addressData = {
      ...createBookingDto.address,
      ...formattedAddress,
    };
    // Create booking
    const booking = await this.prisma.booking.create({
      data: {
        userId,
        serviceId: createBookingDto.serviceId,
        type: createBookingDto.type,
        areaSize: createBookingDto.areaSize,
        noOfRooms: createBookingDto.no_of_rooms,
        noOfBathRooms: createBookingDto.no_of_bathrooms,
        isEco: createBookingDto.isEco || false,
        paymentMethod: createBookingDto.paymentMethod,
        materialProvided: createBookingDto.materialProvided || false,
        propertyType: createBookingDto.propertyType,
        status: BookingStatus.booked,
        date: createBookingDto.date ? new Date(createBookingDto.date) : null,
        price: updatedPrice,
        subscriptionId: createBookingDto.subscriptionId
          ? createBookingDto.subscriptionId
          : null,
        recurringTypeId: recurringType ? recurringType.id : null,
        // subscriptionTypeId: subscriptionType ? subscriptionType.id : null,
        bookingAddress: {
          create: {
            address: {
              create: {
                ...addressData,
                userId,
              },
            },
            specialInstructions,
          },
        },
        bookingLogs: {
          create: {
            status: BookingStatus.booked,
            changedAt: new Date(),
            changedBy: userId,
          },
        },
      },
      include: {
        bookingAddress: {
          include: {
            address: true,
          },
        },
        service: true,
        subscriptionType: true,
      },
    });

    // Add any booking add-ons if provided
    if (createBookingDto.addOnIds && createBookingDto.addOnIds.length > 0) {
      for (const addOnId of createBookingDto.addOnIds) {
        // Check if add-on exists and belongs to the service
        const addOn = await this.prisma.serviceAddOn.findFirst({
          where: {
            id: addOnId,
            serviceId: createBookingDto.serviceId,
          },
        });

        if (!addOn) {
          throw new NotFoundException(
            `Add-on with ID ${addOnId} not found or doesn't belong to the selected service`,
          );
        }

        // Create booking add-on
        await this.prisma.bookingAddOn.create({
          data: {
            bookingId: booking.id,
            addOnId,
            quantity: 1, // Default quantity
          },
        });
      }
    }

    // Notify admin about new booking
    await this.notificationsService.createNotification({
      userId: userId, // This would be admin ID in production
      title: 'New Booking',
      message: `A new booking has been created (ID: ${booking.id})`,
      notificationType: 'new_assignment',
      relatedBookingId: booking.id,
    });

    return booking;
  }

  async findAll(role: string, userId: string, param: any) {
    let where = param;

    if (role === 'customer') {
      where = { userId };
    } else if (role === 'staff') {
      where = { assignedStaffId: userId };
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        service: true,
        monthSchedules: true,
        bookingAddress: {
          include: {
            address: true,
          },
        },
        recurringType: true,
        schedules: true,
        bookingAddOns: {
          include: {
            addOn: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const enhancedBookings = bookings.map((booking) => {
      let nextSchedule = null;
      let earliestDate = null;

      for (const schedule of booking.schedules) {
        if (
          schedule.status === 'scheduled' &&
          !schedule.isSkipped &&
          schedule.startTime &&
          new Date(schedule.startTime) > new Date()
        ) {
          if (
            !earliestDate ||
            new Date(schedule.startTime) < new Date(earliestDate)
          ) {
            earliestDate = schedule.startTime;
            nextSchedule = schedule;
          }
        }
      }

      const squareFeet = booking.areaSize ?? 500; // Default if missing
      const serviceDuration = booking.service?.durationMinutes ?? 60; // Default if missing
      const durationMins = (squareFeet / 500) * serviceDuration;

      return {
        ...booking,
        nextMonthSchedule: nextSchedule,
        durationMins: Math.ceil(durationMins), // Round up if needed
      };
    });

    return enhancedBookings;
  }

  async findOne(id: string, userId?: string, role?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        assignedStaff: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        bookingAddress: {
          include: {
            address: true,
          },
        },
        recurringType: {
          select: {
            id: true,
            name: true,
            description: true,
            dayFrequency: true,
            available_discount: true,
          },
        },
        service: true,
        // bookingLogs: {
        //   include: {
        //     user: {
        //       select: {
        //         id: true,
        //         name: true,
        //       },
        //     },
        //   },
        //   orderBy: {
        //     changedAt: 'desc',
        //   },
        // },
        monthSchedules: true,
        schedules: true,
        review: true,
        transactions: true,
        // bookingAddOns: {
        //   include: {
        //     addOn: true,
        //   },
        // },
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }

    // Check if user has permission to access this booking
    // if (
    //   role !== 'admin' &&
    //   booking.userId !== userId &&
    //   booking.assignedStaffId !== userId
    // ) {
    //   throw new ForbiddenException(
    //     'You do not have permission to access this booking',
    //   );
    // }

    return booking;
  }

  // async reschedule(id: string, userId: string, rescheduleDto: RescheduleDto) {
  //   const booking = await this.prisma.booking.findUnique({
  //     where: { id },
  //     include: { monthSchedules: true, schedules: true },
  //   });

  //   if (!booking) {
  //     throw new NotFoundException('Booking not found');
  //   }

  //   // Find upcoming (non-completed, non-cancelled) schedule
  //   const upcomingSchedule = booking.schedules.find(
  //     (schedule) =>
  //       dayjs(schedule.startTime).isAfter(dayjs()) &&
  //       !['completed', 'cancelled'].includes(schedule.status),
  //   );

  //   if (!upcomingSchedule) {
  //     throw new BadRequestException(
  //       'No upcoming schedule found for this booking',
  //     );
  //   }

  //   // Skip the old month schedule so it's not auto-generated again
  //   await this.prisma.monthSchedule.updateMany({
  //     where: {
  //       bookingId: booking.id,
  //       startTime: upcomingSchedule.startTime,
  //       isSkipped: false,
  //     },
  //     data: {
  //       isSkipped: true,
  //     },
  //   });

  //   // Create a new schedule with the new time
  //   const newSchedule = await this.prisma.schedule.create({
  //     data: {
  //       bookingId: booking.id,
  //       staffId: rescheduleDto.staffId,
  //       startTime: new Date(rescheduleDto.startTime),
  //       endTime: new Date(rescheduleDto.endTime),
  //       status: 'scheduled',
  //       createdById: userId,
  //     },
  //   });

  //   return newSchedule;
  // }

  async update(
    id: string,
    updateBookingDto: UpdateBookingDto,
    userId: string,
    role: string,
  ) {
    const booking = await this.findOne(id, userId, role);

    // Customer rescheduling (if allowed)
    if (updateBookingDto.scheduledDate && role === 'customer') {
      const newScheduledDate = new Date(updateBookingDto.scheduledDate);

      if (booking.schedules && booking.schedules.length > 0) {
        const schedule = booking.schedules[0];
        const serviceDuration = booking.service.durationMinutes * 60000;

        await this.prisma.schedule.update({
          where: { id: schedule.id },
          data: {
            startTime: newScheduledDate,
            endTime: new Date(newScheduledDate.getTime() + serviceDuration),
          },
        });
      }
    }

    // Staff can only update status
    if (
      role === 'staff' &&
      Object.keys(updateBookingDto).some((key) => key !== 'status')
    ) {
      throw new ForbiddenException('Staff can only update booking status');
    }

    // Log and handle status changes
    if (updateBookingDto.status && updateBookingDto.status !== booking.status) {
      await this.prisma.bookingLog.create({
        data: {
          bookingId: id,
          status: updateBookingDto.status,
          changedAt: new Date(),
          changedBy: userId,
        },
      });

      if (updateBookingDto.status === 'in_progress' && role === 'staff') {
        const schedule = booking.schedules?.[0];
        if (schedule) {
          await this.prisma.schedule.update({
            where: { id: schedule.id },
            data: { actualStartTime: new Date() },
          });
        }
      }

      if (updateBookingDto.status === 'completed' && role === 'staff') {
        const schedule = booking.schedules?.[0];
        if (schedule) {
          await this.prisma.schedule.update({
            where: { id: schedule.id },
            data: { actualEndTime: new Date() },
          });
        }

        await this.notificationsService.createNotification({
          userId: booking.userId,
          title: 'Service Completed',
          message:
            'Your cleaning service has been completed. Please leave a review!',
          notificationType: 'status_change',
          relatedBookingId: id,
        });
      }
    }

    // ✅ Update booking address (via `Address` model)
    if (updateBookingDto.address && booking.bookingAddress?.address) {
      await this.prisma.address.update({
        where: { id: booking.bookingAddress.address.id },
        data: updateBookingDto.address,
      });
    }

    // Prepare fields for booking update
    const updateData: any = {};

    if (updateBookingDto.status) {
      updateData.status = updateBookingDto.status;
    }

    if (updateBookingDto.finalAmount) {
      updateData.price = updateBookingDto.finalAmount;
    }

    // 👇 Add more fields as needed (admin-side editable)

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: updateData,
      include: {
        bookingAddress: {
          include: { address: true },
        },
        service: true,
        schedules: true,
        bookingAddOns: {
          include: { addOn: true },
        },
      },
    });

    return updatedBooking;
  }

  async assignStaff(bookingId: string, staffId: string, adminId: string) {
    // Check if booking exists
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        schedules: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${bookingId} not found`);
    }

    // Check if staff exists and has staff role
    const staff = await this.prisma.user.findFirst({
      where: {
        id: staffId,
        role: {
          name: 'staff',
        },
      },
    });

    if (!staff) {
      throw new NotFoundException(
        `Staff with ID ${staffId} not found or user is not staff`,
      );
    }

    // Update schedule if it exists
    if (booking.schedules && booking.schedules.length > 0) {
      await this.prisma.schedule.update({
        where: { id: booking.schedules[0].id },
        data: { staffId },
      });
    }

    // Assign staff to booking
    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        assignedStaffId: staffId,
        status: BookingStatus.pending,
        bookingLogs: {
          create: {
            status: BookingStatus.pending,
            changedAt: new Date(),
            changedBy: adminId,
          },
        },
      },
      include: {
        schedules: true,
        service: true,
        bookingAddress: true,
      },
    });

    // Create notification for staff
    await this.notificationsService.createNotification({
      userId: staffId,
      title: 'New Assignment',
      message: `You have been assigned to booking #${bookingId}`,
      notificationType: 'new_assignment',
      relatedBookingId: bookingId,
    });

    // Create notification for customer
    await this.notificationsService.createNotification({
      userId: booking.userId,
      title: 'Staff Assigned',
      message: `A staff member has been assigned to your booking #${bookingId}`,
      notificationType: 'status_change',
      relatedBookingId: bookingId,
    });

    return updatedBooking;
  }

  async cancelorComplete(
    id: string,
    userId: string,
    role: string,
    status: 'completed' | 'canceled',
  ) {
    const booking = await this.findOne(id, userId);

    if (['completed', 'canceled'].includes(booking.status)) {
      throw new ForbiddenException(`Booking is already ${booking.status}`);
    }

    if (status === 'canceled') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Cancel all future schedules
      const canceledSchedules = await this.prisma.schedule.updateMany({
        where: {
          bookingId: id,
          startTime: {
            gte: today,
          },
          status: 'scheduled',
        },
        data: {
          isSkipped: true,
          status: 'canceled',
        },
      });

      // Remove staff unavailability if needed
      if (booking.assignedStaffId) {
        const relatedSchedules = await this.prisma.schedule.findMany({
          where: {
            bookingId: id,
          },
          select: {
            startTime: true,
          },
        });

        for (const schedule of relatedSchedules) {
          const scheduleDate = new Date(schedule.startTime);
          scheduleDate.setHours(0, 0, 0, 0);

          await this.prisma.staffAvailability.deleteMany({
            where: {
              staffId: booking.assignedStaffId,
              date: scheduleDate,
            },
          });
        }
      }
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        status,
        bookingLogs: {
          create: {
            status,
            changedAt: new Date(),
            changedBy: userId,
          },
        },
      },
      include: {
        service: true,
        bookingAddress: true,
      },
    });

    const notificationTitle = `Booking ${status === 'completed' ? 'Completed' : 'Canceled'}`;
    const notificationMessage =
      status === 'completed'
        ? `Booking #${id} has been marked as completed`
        : `Booking #${id} has been canceled`;

    if (booking.assignedStaffId) {
      await this.notificationsService.createNotification({
        userId: booking.assignedStaffId,
        title: notificationTitle,
        message: notificationMessage,
        notificationType: 'status_change',
        relatedBookingId: id,
      });
    }

    if (role !== 'customer') {
      await this.notificationsService.createNotification({
        userId: booking.userId,
        title: notificationTitle,
        message:
          status === 'completed'
            ? `Your booking has been completed`
            : `Your booking has been canceled`,
        notificationType: 'status_change',
        relatedBookingId: id,
      });
    }

    return updatedBooking;
  }

  async createReview(bookingId: string, userId: string, reviewData: any) {
    // Get the booking to check permissions
    const booking = await this.findOne(bookingId, userId, 'customer');

    // Check if user is the booking customer
    if (booking.userId !== userId) {
      throw new ForbiddenException(
        'Only the booking customer can leave a review',
      );
    }

    // Check if booking is completed
    if (booking.status !== BookingStatus.completed) {
      throw new BadRequestException('Can only review completed bookings');
    }

    // Check if review already exists
    if (booking.review) {
      throw new BadRequestException('Review already exists for this booking');
    }

    // Check if staff was assigned
    if (!booking.assignedStaffId) {
      throw new BadRequestException(
        'Cannot review booking without assigned staff',
      );
    }

    // Create review
    const review = await this.prisma.review.create({
      data: {
        bookingId,
        userId,
        staffId: booking.assignedStaffId,
        rating: reviewData.rating,
        review: reviewData.review,
      },
    });

    // Notify staff about the review
    await this.notificationsService.createNotification({
      userId: booking.assignedStaffId,
      title: 'New Review',
      message: `You have received a new review for booking #${bookingId}`,
      notificationType: 'status_change',
      relatedBookingId: bookingId,
    });

    return review;
  }

  async getBookingHeatmap(year: number, month: number, staffId?: string) {
    // Create start and end dates for the specified month
    const startDate = new Date(year, month - 1, 1); // month is 0-indexed in Date constructor
    const endDate = new Date(year, month, 0); // Last day of the month

    // Set time boundaries
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // Build where clause for filtering schedules by their start time
    const whereClause: any = {
      startTime: {
        gte: startDate,
        lte: endDate,
      },
      isSkipped: false, // Only include non-skipped schedules
      status: {
        notIn: ['canceled', 'rescheduled'], // Exclude canceled and rescheduled schedules
      },
    };

    // Add staff filter if provided
    if (staffId) {
      whereClause.staffId = staffId;
    }

    // Get all schedules for the month
    const schedules = await this.prisma.schedule.findMany({
      where: whereClause,
      select: {
        id: true,
        startTime: true,
        staffId: true,
        bookingId: true,
      },
    });

    // Initialize heatmap data for all days of the month
    const daysInMonth = endDate.getDate();
    const heatmapData: { [day: number]: number } = {};

    // Initialize all days with 0 schedules
    for (let day = 1; day <= daysInMonth; day++) {
      heatmapData[day] = 0;
    }

    // Count schedules per day
    schedules.forEach((schedule) => {
      const day = schedule.startTime.getDate();
      heatmapData[day]++;
    });

    // Convert to array format for easier consumption
    const heatmapArray = Object.entries(heatmapData).map(([day, count]) => {
      const dateObj = new Date(Date.UTC(year, month - 1, parseInt(day)));
      return {
        date: dateObj.toISOString(), // always midnight UTC
        bookingCount: count, // This represents scheduled work count, not booking creation count
      };
    });

    return {
      year,
      month,
      staffId,
      totalBookings: schedules.length, // This is actually total scheduled work count
      heatmapData: heatmapArray,
    };
  }
}
