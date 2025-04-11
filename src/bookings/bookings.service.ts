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

    const subscriptionType = await this.prisma.subscriptionType.findUnique({
      where: { id: createBookingDto.subscriptionTypeId },
    });

    if (!subscriptionType) {
      throw new NotFoundException(`Subscription type not found`);
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
        isEco: createBookingDto.isEco || false,
        materialProvided: createBookingDto.materialProvided || false,
        propertyType: createBookingDto.propertyType,
        status: BookingStatus.booked,
        price: createBookingDto.price,
        subscriptionId: createBookingDto.subscriptionId
          ? createBookingDto.subscriptionId
          : null,
        subscriptionTypeId: subscriptionType.id,
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

    return this.prisma.booking.findMany({
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
        assignedStaff:
          role === 'admin' || role === 'customer'
            ? {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                },
              }
            : undefined,
        service: true,
        bookingAddress: true,
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
        service: true,
        bookingAddress: true,
        bookingLogs: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            changedAt: 'desc',
          },
        },
        schedules: true,
        review: true,
        transactions: true,
        bookingAddOns: {
          include: {
            addOn: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }

    // Check if user has permission to access this booking
    if (
      role !== 'admin' &&
      booking.userId !== userId &&
      booking.assignedStaffId !== userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to access this booking',
      );
    }

    return booking;
  }

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
