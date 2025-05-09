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

function getNextDateFromWeekdayAndWeek(
  weekOfMonth: number,
  dayOfWeek: number,
): Date | null {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-11

  // Try current month first
  let candidate = getDateInMonth(
    currentYear,
    currentMonth,
    weekOfMonth,
    dayOfWeek,
  );

  if (!candidate || candidate < today) {
    candidate = getDateInMonth(
      currentYear,
      currentMonth + 1,
      weekOfMonth,
      dayOfWeek,
    );
  }

  return candidate;
}

function getDateInMonth(
  year: number,
  month: number,
  weekOfMonth: number,
  dayOfWeek: number,
): Date | null {
  const firstDayOfMonth = new Date(year, month, 1);
  const dayOfFirst = firstDayOfMonth.getDay();
  const offset = (dayOfWeek - dayOfFirst + 7) % 7;
  const day = 1 + offset + (weekOfMonth - 1) * 7;

  const result = new Date(year, month, day);
  return result.getMonth() === month ? result : null;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(createBookingDto: CreateBookingDto, userId: string) {
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
        price: createBookingDto.price,
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
        bookingAddress: true,
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

    // Filter bookings based on user role
    if (role === 'customer') {
      where = { userId };
    } else if (role === 'staff') {
      where = { assignedStaffId: userId };
    }
    // Admin sees all bookings (no filter)

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
        // assignedStaff:
        //   role === 'admin' || role === 'customer'
        //     ? {
        //         select: {
        //           id: true,
        //           name: true,
        //           email: true,
        //           phone: true,
        //         },
        //       }
        //     : undefined,
        // service: true,
        monthSchedules: true,
        bookingAddress: {
          include: {
            address: true,
          },
        },
        subscriptionType: true,
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
      let nextMonthSchedule: any = null;
      let earliestDate: Date | null = null;

      for (const ms of booking.monthSchedules) {
        const nextDate = getNextDateFromWeekdayAndWeek(
          ms.weekOfMonth,
          ms.dayOfWeek,
        );
        if (nextDate && (!earliestDate || nextDate < earliestDate)) {
          earliestDate = nextDate;
          nextMonthSchedule = {
            ...ms,
            nextDate,
          };
        }
      }

      return {
        ...booking,
        nextMonthSchedule, // Will be null if no valid monthSchedules exist
      };
    });

    return enhancedBookings;
  }

  async findOne(id: string, userId: string, role: string) {
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
    // Get the booking to check permissions and current state
    const booking = await this.findOne(id, userId, role);

    // Check if booking can be modified (before modification deadline)
    if (updateBookingDto.scheduledDate && role === 'customer') {
      // Parse new scheduled date
      const newScheduledDate = new Date(updateBookingDto.scheduledDate);

      // Update the schedules with new times
      if (booking.schedules && booking.schedules.length > 0) {
        const schedule = booking.schedules[0];
        const serviceDuration = booking.service.durationMinutes * 60000; // Convert to milliseconds

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

    // Handle status change
    if (updateBookingDto.status && updateBookingDto.status !== booking.status) {
      // Log status change
      await this.prisma.bookingLog.create({
        data: {
          bookingId: id,
          status: updateBookingDto.status,
          changedAt: new Date(),
          changedBy: userId,
        },
      });

      // If staff marking as in-progress, update actual start time
      if (updateBookingDto.status === 'in_progress' && role === 'staff') {
        // Find the schedule for this booking
        if (booking.schedules && booking.schedules.length > 0) {
          const schedule = booking.schedules[0];
          await this.prisma.schedule.update({
            where: { id: schedule.id },
            data: { actualStartTime: new Date() },
          });
        }
      }

      // If staff marking as completed, update actual end time
      if (updateBookingDto.status === 'completed' && role === 'staff') {
        // Find the schedule for this booking
        if (booking.schedules && booking.schedules.length > 0) {
          const schedule = booking.schedules[0];
          await this.prisma.schedule.update({
            where: { id: schedule.id },
            data: { actualEndTime: new Date() },
          });
        }

        // Create notification for customer to leave a review
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

    // Prepare data for update
    const updateData: any = {};

    if (updateBookingDto.status) {
      updateData.status = updateBookingDto.status;
    }

    // Handle address update if provided
    if (updateBookingDto.address && booking.bookingAddress) {
      await this.prisma.bookingAddress.update({
        where: { id: booking.bookingAddress.id },
        data: updateBookingDto.address,
      });
    }

    // Update booking
    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: updateData,
      include: {
        bookingAddress: true,
        service: true,
        schedules: true,
        bookingAddOns: {
          include: {
            addOn: true,
          },
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

  async cancel(id: string, userId: string, role: string) {
    // Get the booking to check permissions
    const booking = await this.findOne(id, userId, role);

    // Check if booking can be canceled (not already completed or canceled)
    if (['completed', 'canceled'].includes(booking.status)) {
      throw new ForbiddenException(`Booking is already ${booking.status}`);
    }

    // Cancel booking
    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.canceled,
        bookingLogs: {
          create: {
            status: BookingStatus.canceled,
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

    // Notify staff if assigned
    if (booking.assignedStaffId) {
      await this.notificationsService.createNotification({
        userId: booking.assignedStaffId,
        title: 'Booking Canceled',
        message: `Booking #${id} has been canceled`,
        notificationType: 'status_change',
        relatedBookingId: id,
      });
    }

    // If canceled by admin or staff, notify customer
    if (role !== 'customer') {
      await this.notificationsService.createNotification({
        userId: booking.userId,
        title: 'Booking Canceled',
        message: `Your booking #${id} has been canceled`,
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
}
