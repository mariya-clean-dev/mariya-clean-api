import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { BookingStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { ZonesService } from '../zones/zones.service';
import { UsersService } from '../users/users.service';
import dayjs from 'dayjs';
import { RescheduleDto } from './dto/reschedule.dto';
import { CouponsService } from '../coupons/coupons.service';
import { SchedulerService } from '../scheduler/scheduler.service';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly zonesService: ZonesService,
    private readonly usersService: UsersService,
    private readonly couponsService: CouponsService,
    @Inject(forwardRef(() => SchedulerService))
    private readonly schedulerService: SchedulerService,
  ) {}

  async create(createBookingDto: CreateBookingDto, userId: string, status?: BookingStatus) {
    let updatedPrice = createBookingDto.price;
    const bookingStatus = status || BookingStatus.booked;

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

    // Validate pincode and get zone
    const zone = await this.zonesService.validatePincode(
      createBookingDto.address.zip,
    );

    if (!zone) {
      throw new BadRequestException(
        `Pincode ${createBookingDto.address.zip} is not currently serviced. Please check available service areas.`,
      );
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

    // Apply coupon discount if provided
    let discountAmount = 0;
    let couponId: string | null = null;
    
    if (createBookingDto.couponCode) {
      try {
        const couponValidation = await this.couponsService.validateCoupon(
          createBookingDto.couponCode,
          userId,
          updatedPrice,
        );
        
        discountAmount = couponValidation.discountAmount;
        updatedPrice = couponValidation.finalAmount;
        couponId = couponValidation.coupon.id;
      } catch (error) {
        // Re-throw coupon validation errors to the user
        throw error;
      }
    }

    // Create booking with zone assignment
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
        status: bookingStatus,
        date: createBookingDto.date ? new Date(createBookingDto.date) : null,
        price: updatedPrice,
        zoneId: zone.id,
        subscriptionId: createBookingDto.subscriptionId
          ? createBookingDto.subscriptionId
          : null,
        recurringTypeId: recurringType ? recurringType.id : null,
        couponId: couponId,
        discountAmount: discountAmount,
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
            status: bookingStatus,
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

    // Record coupon usage if a coupon was applied
    if (couponId && discountAmount > 0) {
      try {
        await this.couponsService.recordUsage(
          couponId,
          userId,
          booking.id,
          discountAmount,
        );
      } catch (error) {
        // Log error but don't fail the booking if usage tracking fails
        console.error('Failed to record coupon usage:', error);
      }
    }

    // Notify all admins and staff about new booking
    try {
      // Get all admin users
      const adminUsers = await this.usersService.findByRole('admin');
      
      // Get all staff users
      const staffUsers = await this.usersService.findByRole('staff');
      
      // Combine admin and staff users
      const usersToNotify = [...adminUsers, ...staffUsers];
      
      // Send notification to each admin and staff user
      for (const user of usersToNotify) {
        await this.notificationsService.createNotification({
          userId: user.id,
          title: 'New Booking',
          message: `A new booking has been created (ID: ${booking.id})`,
          notificationType: 'new_assignment',
          relatedBookingId: booking.id,
        });
      }
    } catch (error) {
      // Log error but don't fail the booking creation
      console.error('Failed to send notifications to admins/staff:', error);
    }

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
        zone: true,
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

    // Validate staff belongs to booking's zone
    if (booking.zoneId) {
      const staffZone = await this.zonesService.getStaffZone(staffId);

      if (!staffZone || staffZone.id !== booking.zoneId) {
        throw new BadRequestException(
          `Staff ${staff.name} is not assigned to the zone for this booking. Booking zone: ${booking.zone?.name || 'Unknown'}, Staff zone: ${staffZone?.name || 'Not assigned'}`,
        );
      }
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

      // Cancel all future schedules (including those with other statuses)
      const canceledSchedules = await this.prisma.schedule.updateMany({
        where: {
          bookingId: id,
          startTime: {
            gte: today,
          },
          status: {
            notIn: ['completed', 'canceled'], // Don't update already completed or canceled
          },
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

  async getNextUpcomingSchedules(userId: string) {
    // Find all active bookings for the user
    const activeBookings = await this.prisma.booking.findMany({
      where: {
        userId,
        status: {
          in: [BookingStatus.booked, BookingStatus.in_progress, BookingStatus.pending],
        },
      },
      select: {
        id: true,
      },
    });

    const bookingIds = activeBookings.map((booking) => booking.id);

    // For each booking, get the next upcoming schedule
    const schedules = await Promise.all(
      bookingIds.map(async (bookingId) => {
        return this.prisma.schedule.findFirst({
          where: {
            bookingId,
            isSkipped: false,
            status: 'scheduled',
            startTime: { gt: new Date() },
          },
          include: {
            staff: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            booking: {
              select: {
                id: true,
                status: true,
                paymentMethod: true,
                customer: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                  },
                },
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
            startTime: 'asc',
          },
        });
      }),
    );

    // Filter out null schedules and sort by start time
    const data = schedules
      .filter((schedule) => schedule !== null)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return {
      data,
      meta: {
        total: data.length,
        page: 1,
        limit: data.length,
        totalPages: 1,
      },
    };
  }
}
