import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { Prisma, Schedule, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-scheduler.dto';
import { UpdateScheduleDto } from './dto/update-scheduler.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { CreateMonthScheduleDto } from './dto/create-month-schedule.dto';
import dayjs from 'dayjs';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduleStatus, ServiceType, User } from '@prisma/client';
import { RescheduleDto } from '../bookings/dto/reschedule.dto';
import { Booking } from 'src/bookings/entities/booking.entity';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { compareSync } from 'bcrypt';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { BookingsService } from 'src/bookings/bookings.service';
import { PaymentsService } from 'src/payments/payments.service';
import { StripeService } from 'src/stripe/stripe.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { DateTime, Interval } from 'luxon';
import { scheduled } from 'rxjs';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(isBetween);
// dayjs.extend(isoWeek);
// dayjs.extend(advancedFormat);

const DEFAULT_TIMEZONE = 'America/New_York';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingService: BookingsService,
    private readonly stripeService: StripeService,
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
  ) { }

  async findAvailableStaff(startTime: Date, endTime: Date, zoneId?: string) {
    const where: any = {
      role: { name: 'staff' },
      status: 'active',
    };

    // Filter by zone if provided
    if (zoneId) {
      where.staffZone = {
        is: {
          zoneId,
        },
      };
    }

    const allStaff = await this.prisma.user.findMany({
      where,
      orderBy: { priority: 'asc' },
    });
    for (const staff of allStaff) {
      const hasConflict = await this.prisma.schedule.findFirst({
        where: {
          staffId: staff.id,
          status: { notIn: ['canceled', 'rescheduled'] }, // Exclude canceled and rescheduled schedules
          isSkipped: false,
          OR: [
            {
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          ],
        },
      });

      if (!hasConflict) return staff;
    }

    return null;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    staffId?: string,
    bookingId?: string,
    startDate?: Date,
    endDate?: Date,
    status?: string,
  ) {
    const where: any = {};

    if (staffId) {
      where.staffId = staffId;
    }

    if (status) {
      where.status = status;
    }

    if (bookingId) {
      where.bookingId = bookingId;
    }

    if (startDate || endDate) {
      if (!where.startTime) where.startTime = {};

      if (startDate) {
        const parsedStart = new Date(
          new Date(startDate).setUTCHours(0, 0, 0, 0),
        );
        if (!isNaN(parsedStart.getTime())) {
          where.startTime.gte = parsedStart;
        }
      }

      if (endDate) {
        const parsedEnd = new Date(
          new Date(endDate).setUTCHours(23, 59, 59, 999),
        );
        if (!isNaN(parsedEnd.getTime())) {
          where.startTime.lte = parsedEnd;
        }
      }
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.schedule.findMany({
        where: { ...where, isSkipped: false },
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
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.schedule.count({ where }),
    ]);

    return {
      data,
      meta: {
        total: data.length,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAvailableTimeSlots(
    dateStr: string,
    planId: string | null,
    durationMins: number,
    pincode?: string,
  ) {
    const baseDate = new Date(dateStr);
    let simulatedDates: Date[];
    let zoneId: string | undefined;

    // Validate pincode if provided
    if (pincode) {
      const pincodeRecord = await this.prisma.pincode.findFirst({
        where: {
          code: pincode,
          isActive: true,
          deletedAt: null,
        },
        include: {
          zone: {
            where: {
              isActive: true,
              deletedAt: null,
            },
          },
        },
      });

      if (!pincodeRecord || !pincodeRecord.zone) {
        throw new BadRequestException(
          `Pincode ${pincode} is not currently serviced`,
        );
      }

      zoneId = pincodeRecord.zone.id;
    }

    const plan = planId
      ? await this.prisma.recurringType.findUnique({ where: { id: planId } })
      : null;

    // For recurring bookings, calculate ALL dates within 60 days
    if (plan) {
      const startDateTime = DateTime.fromJSDate(baseDate, { zone: 'UTC' }).startOf('day');
      const endDateTime = startDateTime.plus({ days: 60 });

      simulatedDates = [];
      let current = startDateTime;

      while (current <= endDateTime) {
        simulatedDates.push(current.toJSDate());
        current = current.plus({ days: plan.dayFrequency });
      }

      console.log(`📅 Checking ${simulatedDates.length} recurring dates for availability`);
    } else {
      simulatedDates = [baseDate];
    }

    const from = new Date(simulatedDates[0]);
    from.setHours(0, 0, 0, 0);
    const to = new Date(simulatedDates[simulatedDates.length - 1]);
    to.setHours(23, 59, 59, 999);

    const allSchedules = await this.prisma.schedule.findMany({
      where: {
        status: { notIn: ['canceled', 'rescheduled'] },
        isSkipped: false,
        startTime: { gte: from, lte: to },
      },
    });

    // Fetch staff filtered by zone if provided
    const staffWhere: any = {
      role: { name: 'staff' },
      status: 'active',
    };

    if (zoneId) {
      staffWhere.staffZone = {
        is: {
          zoneId,
        },
      };
    }

    const staffList = await this.prisma.user.findMany({
      where: staffWhere,
      orderBy: { priority: 'asc' },
    });

    if (staffList.length === 0) {
      console.warn(`⚠️ No staff available in the zone${zoneId ? ` (zoneId: ${zoneId})` : ''}`);
      // Return all slots as unavailable
      const slots = generateTimeSlots();
      slots.forEach(slot => slot.isAvailable = false);
      return slots;
    }

    console.log(`✅ Found ${staffList.length} staff in zone${zoneId ? ` (zoneId: ${zoneId})` : ''}`);


    const slots = generateTimeSlots();
    const bufferMins = 30;

    for (const slot of slots) {
      const [hour, minute] = slot.time.split(':').map(Number);

      // For this time slot, check if at least one staff is available on ALL recurring dates
      let isSlotAvailable = false;

      for (const staff of staffList) {
        const staffSchedules = allSchedules.filter(
          (s) => s.staffId === staff.id,
        );

        // Check if this staff has conflicts on ANY of the recurring dates
        const hasAnyConflict = simulatedDates.some((date) => {
          const start = new Date(date);
          start.setHours(hour, minute, 0, 0);
          const end = new Date(start.getTime() + (durationMins + bufferMins) * 60000);
          return hasConflict(staffSchedules, start, end);
        });

        // If this staff has no conflicts on any date, the slot is available
        if (!hasAnyConflict) {
          isSlotAvailable = true;
          break;
        }
      }

      slot.isAvailable = isSlotAvailable;
    }

    return slots;
  }

  async createMonthSchedules(schedules: CreateMonthScheduleDto[]) {
    // Enhance schedules with weekOfMonth calculation
    const enhancedSchedules = schedules.map(schedule => {
      // If weekOfMonth is not provided, calculate it from the booking date
      if (schedule.weekOfMonth === undefined || schedule.weekOfMonth === null) {
        // We'll need the booking to get the date
        return schedule;
      }
      return schedule;
    });

    const created = await this.prisma.monthSchedule.createMany({
      data: enhancedSchedules,
    });

    return {
      message: `${created.count} month schedules created successfully.`,
    };
  }

  async findOne(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
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
    });

    if (!schedule) {
      throw new NotFoundException(`Schedule not found`);
    }

    return schedule;
  }

  /**
   * Updates the status of an existing schedule. 
   * IMPORTANT: This method ONLY updates the schedule status, it does NOT create new schedules.
   * Only the reschedule API should create new schedules.
   * 
   * Handles payment processing for online payments when marking as completed.
   * Creates transaction records for payment tracking (not schedule records).
   */
  async updateSheduleStatus(
    id: string,
    status: ScheduleStatus,
    userId: string,
    role: string,
  ) {
    console.log(`📝 Updating schedule ${id} status to: ${status}`);

    const scheduleExist = await this.prisma.schedule.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            customer: true,
            service: true,
          },
        },
      },
    });

    if (!scheduleExist) {
      throw new NotFoundException('Schedule not found');
    }

    const booking = scheduleExist.booking;
    if (!booking) {
      console.log(`⚠️ No booking found for schedule ${id}, returning existing schedule`);
      return scheduleExist;
    }

    const isCompleted = status === 'completed';
    const isCanceled = status === 'canceled';
    const isMissed = status === 'missed';
    const isOnlinePayment = booking.paymentMethod === 'online';

    let updatedSchedule;

    // Handle completion with online payment - process payment first
    if (isCompleted && isOnlinePayment) {
      const stripeCustomerId = booking.customer.stripeCustomerId;
      const paymentMethodId = booking.customer.stripePaymentId;
      const amountInCents = Number(booking.price) * 100;
      const currency = 'usd';

      if (!stripeCustomerId || !paymentMethodId) {
        throw new BadRequestException(
          'Stripe customer or payment method ID missing',
        );
      }

      try {
        console.log(`💳 Processing online payment for schedule ${id}`);

        // Create payment intent (charge the saved card)
        const paymentIntent = await this.stripeService.chargeSavedCard({
          customerId: stripeCustomerId,
          amount: amountInCents,
          currency,
          paymentMethodId,
          metadata: {
            bookingId: booking.id,
            scheduleId: scheduleExist.id,
            userId,
            triggeredBy: role,
          },
        });

        // ✅ UPDATE (not create) the schedule as completed
        updatedSchedule = await this.prisma.schedule.update({
          where: { id },
          data: { status: ScheduleStatus.completed },
        });

        // Record transaction as pending (this is a payment record, not a schedule)
        await this.prisma.transaction.create({
          data: {
            bookingId: booking.id,
            stripePaymentId: paymentIntent.id,
            amount: new Prisma.Decimal(amountInCents / 100),
            currency,
            status: 'pending', // Initially pending
            paymentMethod: 'card',
            transactionType: 'charge',
          },
        });

        console.log(`✅ Schedule ${id} updated to completed with pending payment`);
      } catch (err) {
        console.error(`❌ Payment failed for schedule ${id}:`, err.message);

        // Log failed transaction (this is a payment record, not a schedule)
        await this.prisma.transaction.create({
          data: {
            bookingId: booking.id,
            amount: new Prisma.Decimal(amountInCents / 100),
            currency,
            status: 'failed',
            paymentMethod: 'card',
            transactionType: 'charge',
            failureReason: err.message,
          },
        });

        // ✅ UPDATE (not create) schedule to payment_failed
        await this.prisma.schedule.update({
          where: { id },
          data: { status: 'payment_failed' },
        });

        throw new BadRequestException('Stripe payment failed: ' + err.message);
      }
    } else {
      // For cash, cancellation, or other status changes - update directly
      console.log(`✅ Updating schedule ${id} status directly to: ${status}`);

      // ✅ UPDATE (not create) status directly
      updatedSchedule = await this.prisma.schedule.update({
        where: { id },
        data: { status },
      });
    }

    // Handle cash payment completion - record transaction
    if (isCompleted && !isOnlinePayment) {
      console.log(`💵 Recording cash payment transaction for schedule ${id}`);

      // Create transaction record for cash payment (this is a payment record, not a schedule)
      await this.prisma.transaction.create({
        data: {
          bookingId: booking.id,
          amount: new Prisma.Decimal(booking.price),
          currency: 'usd',
          status: 'successful',
          paymentMethod: 'cash',
          transactionType: 'manual',
        },
      });
    }

    // Handle one-time booking completion or cancellation
    if (booking.type === 'one_time' && (isCompleted || isCanceled)) {
      console.log(`📦 Updating one-time booking ${booking.id} status to ${status}`);
      await this.bookingService.cancelorComplete(
        booking.id,
        userId,
        role,
        status,
      );
    }

    // 🔔 Send notification about status change
    await this.notificationsService.notifyScheduleStatusChange(
      id,
      scheduleExist.status,
      status,
    );

    console.log(`✅ Schedule ${id} status update completed successfully`);
    return updatedSchedule;
  }

  async update(id: string, updateScheduleDto: UpdateScheduleDto) {
    // Check if schedule exists
    await this.findOne(id);

    // Prepare update data
    const updateData: any = {};

    // Handle start time update
    if (updateScheduleDto.startTime) {
      updateData.startTime = new Date(updateScheduleDto.startTime);
    }

    // Handle end time update
    if (updateScheduleDto.endTime) {
      updateData.endTime = new Date(updateScheduleDto.endTime);
    }

    // Handle actual start time update
    if (updateScheduleDto.actualStartTime) {
      updateData.actualStartTime = new Date(updateScheduleDto.actualStartTime);
    }

    // Handle actual end time update
    if (updateScheduleDto.actualEndTime) {
      updateData.actualEndTime = new Date(updateScheduleDto.actualEndTime);
    }

    // Validate time range if both times are provided
    if (updateData.startTime && updateData.endTime) {
      if (updateData.endTime <= updateData.startTime) {
        throw new BadRequestException('End time must be after start time');
      }
    } else if (updateData.startTime) {
      // If only start time is provided, get existing end time and validate
      const schedule = await this.prisma.schedule.findUnique({
        where: { id },
        select: { endTime: true },
      });
      if (updateData.startTime >= schedule.endTime) {
        throw new BadRequestException('Start time must be before end time');
      }
    } else if (updateData.endTime) {
      // If only end time is provided, get existing start time and validate
      const schedule = await this.prisma.schedule.findUnique({
        where: { id },
        select: { startTime: true },
      });
      if (schedule.startTime >= updateData.endTime) {
        throw new BadRequestException('End time must be after start time');
      }
    }

    // Check for schedule conflicts if time range changes
    if (updateData.startTime || updateData.endTime) {
      const currentSchedule = await this.prisma.schedule.findUnique({
        where: { id },
        select: { staffId: true, startTime: true, endTime: true },
      });

      const newStartTime = updateData.startTime || currentSchedule.startTime;
      const newEndTime = updateData.endTime || currentSchedule.endTime;

      const conflictingSchedule = await this.prisma.schedule.findFirst({
        where: {
          id: { not: id }, // Exclude current schedule
          staffId: currentSchedule.staffId,
          OR: [
            // Updated schedule starts during existing schedule
            {
              startTime: { lte: newStartTime },
              endTime: { gt: newStartTime },
            },
            // Updated schedule ends during existing schedule
            {
              startTime: { lt: newEndTime },
              endTime: { gte: newEndTime },
            },
            // Updated schedule entirely contains existing schedule
            {
              startTime: { gte: newStartTime },
              endTime: { lte: newEndTime },
            },
          ],
        },
      });

      if (conflictingSchedule) {
        throw new BadRequestException(
          'Schedule conflicts with an existing schedule',
        );
      }
    }

    // Update schedule
    return this.prisma.schedule.update({
      where: { id },
      data: updateData,
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

  /**
   * Reschedules a booking to a new date/time.
   * IMPORTANT: This is the ONLY method that should create new schedules after initial booking.
   * - Marks the old schedule as 'rescheduled'
   * - Creates a NEW schedule with the new date/time
   */
  async rescheduleBookingSchedule(bookingId: string, dto: RescheduleDto) {
    const { newDate, time } = dto;

    if (!/^\d{2}:\d{2}$/.test(time)) {
      throw new BadRequestException('Time must be in HH:mm format');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { schedules: true },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    const existingSchedule = await this.getNextScheduleForBooking(bookingId);

    if (!existingSchedule) {
      throw new NotFoundException(
        'No upcoming schedule found for this booking',
      );
    }

    const startTime = dayjs(`${newDate}T${time}`).toDate();
    if (isNaN(startTime.getTime())) {
      throw new BadRequestException('Invalid date or time');
    }

    const durationMs =
      new Date(existingSchedule.endTime).getTime() -
      new Date(existingSchedule.startTime).getTime();
    const endTime = new Date(startTime.getTime() + durationMs);

    if (dayjs(startTime).isBefore(dayjs().add(3, 'day'))) {
      throw new BadRequestException(
        'New schedule must be at least 3 days in the future',
      );
    }

    if (existingSchedule.staffId) {
      const hasConflict = await this.prisma.schedule.findFirst({
        where: {
          staffId: existingSchedule.staffId,
          id: { not: existingSchedule.id },
          OR: [
            {
              startTime: { lte: startTime },
              endTime: { gt: startTime },
            },
            {
              startTime: { lt: endTime },
              endTime: { gte: endTime },
            },
            {
              startTime: { gte: startTime },
              endTime: { lte: endTime },
            },
          ],
        },
      });

      if (hasConflict) {
        throw new ConflictException('Staff is unavailable at the new time');
      }
    }

    const updatedOldSchedule = await this.prisma.schedule.update({
      where: { id: existingSchedule.id },
      data: { status: ScheduleStatus.rescheduled },
    });

    console.log(`🔄 Creating new rescheduled schedule for booking ${bookingId}`);

    // ✅ CREATE new schedule (this is the ONLY place where schedules are created after initial booking)
    const newSchedule = await this.prisma.schedule.create({
      data: {
        staffId: existingSchedule.staffId,
        bookingId,
        serviceId: existingSchedule.serviceId,
        startTime,
        endTime,
        status: ScheduleStatus.scheduled,
      },
    });

    console.log(`✅ Reschedule completed: old schedule ${existingSchedule.id} → new schedule ${newSchedule.id}`);

    // 🔔 Send notifications about reschedule
    await this.notificationsService.notifyReschedule(
      existingSchedule.id,
      newSchedule.id,
      bookingId,
    );

    return {
      message: 'Booking successfully rescheduled',
      rescheduled: updatedOldSchedule,
      newSchedule,
    };
  }

  public async getNextScheduleForBooking(bookingId: string) {
    return this.prisma.schedule.findFirst({
      where: {
        bookingId,
        status: 'scheduled',
        startTime: { gt: new Date() },
      },
      orderBy: {
        startTime: 'asc',
      },
    });
  }

  async remove(id: string) {
    // Check if schedule exists
    await this.findOne(id);

    // Delete schedule
    await this.prisma.schedule.delete({
      where: { id },
    });

    return { message: 'Schedule deleted successfully' };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleAutoScheduling(): Promise<void> {
    const today = new Date();
    this.logger.log('Running Auto-Scheduler...');

    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 60);

    await this.generateSchedulesForDate(today, targetDate);

    this.logger.log('Auto-Scheduler completed.');
  }

  async generateSchedulesForDate(
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (
      let currentDate = new Date(startDate);
      currentDate <= new Date(endDate);
      currentDate.setDate(currentDate.getDate() + 1)
    ) {
      const day = currentDate.getDay();

      const bookings = await this.prisma.booking.findMany({
        where: {
          type: ServiceType.recurring,
          status: { notIn: ['canceled', 'pending', 'completed'] }, // Exclude canceled, pending, and completed
          monthSchedules: { some: { dayOfWeek: day, skip: false } },
        },
        include: {
          service: true,
          recurringType: true,
          monthSchedules: true,
        },
      });

      for (const booking of bookings) {
        const { service, recurringType, monthSchedules, areaSize } = booking;
        const bookingStartDate = new Date(booking.date);
        bookingStartDate.setHours(0, 0, 0, 0);

        const current = new Date(currentDate);
        current.setHours(0, 0, 0, 0);

        const dayFrequency = recurringType?.dayFrequency ?? 7;
        const msDiff = current.getTime() - bookingStartDate.getTime();
        const daysSinceBooking = Math.floor(msDiff / (1000 * 60 * 60 * 24));

        // Skip if not part of recurring pattern
        if (daysSinceBooking % dayFrequency !== 0) continue;

        const isSkipped = current > today && current < bookingStartDate; // ⬅️ Skipped but in future

        const schedulesForDay = monthSchedules.filter(
          (ms) => ms.dayOfWeek === day && !ms.skip,
        );
        if (schedulesForDay.length === 0) continue;

        const alreadyScheduled = await this.checkIfBookingScheduled(
          booking.id,
          currentDate,
        );
        if (alreadyScheduled) continue;

        for (const ms of schedulesForDay) {
          const [hours, minutes] = ms.time.split(':').map(Number);

          const startDateTime = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            currentDate.getDate(),
            hours,
            minutes,
            0,
            0,
          );

          const durationMins = getDurationFromAreaSize(
            areaSize,
            service.durationMinutes,
          );
          const endDateTime = new Date(
            startDateTime.getTime() + durationMins * 60 * 1000,
          );

          const availableStaff = await this.findAvailableStaffSlot(
            currentDate,
            day,
            startDateTime,
            endDateTime,
            booking.zoneId,
          );

          if (availableStaff) {
            await this.saveSchedule({
              bookingId: booking.id,
              staffId: availableStaff.id,
              serviceId: service.id,
              date: startDateTime.toISOString().slice(0, 10),
              startTime: startDateTime.toISOString(),
              endTime: endDateTime.toISOString(),
              timezone: 'UTC',
              isSkipped, // ✅ Skipped flag
            });

            this.logger.log(
              `${isSkipped ? '⚠️ Skipped' : '✅'} Schedule saved for booking ${booking.id} on ${currentDate.toDateString()} with staff ${availableStaff.id}`,
            );
          } else {
            this.logger.warn(
              `❌ No available staff for booking ${booking.id} on ${currentDate.toDateString()}`,
            );
          }
        }
      }
    }
  }

  async blockStaffAvailability(
    staffId: string,
    startTime: Date,
    endTime: Date,
    dayOfWeek: number,
  ) {
    const dateOnly = new Date(
      startTime.toISOString().split('T')[0] + 'T00:00:00.000Z',
    );

    await this.prisma.staffAvailability.create({
      data: {
        staff: { connect: { id: staffId } },
        date: dateOnly,
        dayOfWeek,
        startTime,
        endTime,
        isAvailable: false,
      },
    });
  }

  async generateSchedulesForBooking(
    bookingId: string,
    durationInDays = 0,
    timeFromInput?: string, // Only for one-time bookings
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true, recurringType: true, monthSchedules: true },
    });
    if (!booking) throw new Error('Booking not found');

    const { service, areaSize, type, date } = booking;

    const durationMins = getDurationFromAreaSize(
      areaSize,
      service.durationMinutes,
    );

    const bookingStartDate = new Date(date);

    const scheduleDates: {
      date: Date;
      time: string;
      dayOfWeek: number;
      isSkipped: boolean;
    }[] = [];

    if (type === 'one_time') {
      const time = timeFromInput || '10:00';
      const dayOfWeek = bookingStartDate.getDay();
      scheduleDates.push({
        date: bookingStartDate,
        time,
        dayOfWeek,
        isSkipped: false,
      });
    } else if (type === 'recurring') {
      const recurringType = booking.recurringType;
      const dayFrequency = recurringType?.dayFrequency ?? 7;
      const template = booking.monthSchedules.find((ms) => !ms.skip);

      if (!template) {
        console.warn(`⚠️ No usable schedule template for booking ${bookingId}`);
        return;
      }

      const { time, dayOfWeek } = template;
      const start = DateTime.fromJSDate(bookingStartDate, {
        zone: 'UTC',
      }).startOf('day');
      const end = start.plus({ days: durationInDays });

      let hasSkipped = false;

      // 🔁 One skipped schedule before start date
      let prev = start.minus({ days: dayFrequency });
      if (prev.weekday % 7 === dayOfWeek % 7) {
        scheduleDates.push({
          date: prev.toJSDate(),
          time,
          dayOfWeek,
          isSkipped: true,
        });
        hasSkipped = true;
      }
      // 🔁 Forward schedules from startDate to endDate
      let current = start;
      while (current <= end) {
        if (current.weekday % 7 === dayOfWeek % 7) {
          scheduleDates.push({
            date: current.toJSDate(),
            time,
            dayOfWeek,
            isSkipped: false,
          });
        }
        current = current.plus({ days: dayFrequency });
      }

      scheduleDates.sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    for (const { date, time, dayOfWeek, isSkipped } of scheduleDates) {
      const [h, m] = time.split(':').map(Number);
      const start = new Date(date);
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + durationMins * 60000);

      const exists = await this.checkIfBookingScheduled(booking.id, start);
      if (exists) {
        console.log(`🚫 Schedule already exists for ${start.toISOString()}`);
        continue;
      }

      const staff = await this.findAvailableStaffSlot(
        start,
        dayOfWeek,
        start,
        end,
        booking.zoneId,
      );

      if (!staff && !isSkipped) {
        console.warn(`❌ No available staff for ${start.toISOString()}`);
        continue;
      }

      await this.saveSchedule({
        date: start.toISOString().slice(0, 10),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        bookingId: booking.id,
        staffId: staff?.id ?? null,
        serviceId: service.id,
        timezone: 'UTC',
        isSkipped,
      });

      console.log(
        `${isSkipped ? '⚪ Skipped' : '📅 Scheduled'}: ${start.toISOString()} with ${staff?.name ?? 'no staff'
        }`,
      );
    }

    console.log(`✅ Schedule generation complete for booking: ${booking.id}`);
  }

  getNextDateByDayOfWeekLuxon(dayOfWeek: number, timezone: string): DateTime {
    const now = DateTime.now().setZone(timezone).startOf('day');
    let daysToAdd = (dayOfWeek - now.weekday + 7) % 7;
    if (daysToAdd === 0) daysToAdd = 7; // always pick *next* matching weekday
    return now.plus({ days: daysToAdd });
  }

  getNextDateByDayOfWeek(targetDay: number): Date {
    const today = new Date();

    // Normalize Sunday=0 to Sunday=7
    const currentDay = today.getDay() === 0 ? 7 : today.getDay();

    let daysToAdd = (targetDay - currentDay + 7) % 7;
    if (daysToAdd === 0) daysToAdd = 7; // always move forward

    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysToAdd);

    console.log(
      `🧠 [getNextDateByDayOfWeek] Target: ${targetDay}, Today: ${currentDay}, Next: ${nextDate.toDateString()}`,
    );

    return nextDate;
  }

  // Helper functions (for context):

  async checkIfBookingScheduled(bookingId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    return await this.prisma.schedule.findFirst({
      where: {
        bookingId,
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          notIn: ['canceled', 'rescheduled'], // Exclude canceled and rescheduled schedules
        },
      },
    });
  }

  async saveSchedule(params: {
    date: string; // 'YYYY-MM-DD' or ISO
    startTime: string; // ISO or 'HH:mm:ss'
    endTime: string; // ISO or 'HH:mm:ss'
    bookingId: string;
    staffId?: string | null;
    serviceId: string;
    timezone?: string;
    isSkipped?: boolean;
  }) {
    const {
      date,
      startTime,
      endTime,
      bookingId,
      staffId,
      serviceId,
      timezone = 'UTC',
      isSkipped = false,
    } = params;

    console.log('🛠️ Parsing schedule with:', {
      date,
      startTime,
      endTime,
      timezone,
      isSkipped,
    });

    const isISO = (str: string) => /^\d{4}-\d{2}-\d{2}T/.test(str);

    let start: Date;
    let end: Date;
    let jsParsedDate: Date;

    try {
      if (isISO(startTime) && isISO(endTime)) {
        // ✅ Already full ISO strings - directly use without transforming
        start = new Date(startTime);
        end = new Date(endTime);
        jsParsedDate = new Date(date); // this is just for availability tracking
      } else {
        // 🛠 Fallback for format like '10:00:00' with separate date
        const localStart = DateTime.fromFormat(
          `${date} ${startTime}`,
          'yyyy-MM-dd HH:mm:ss',
          { zone: timezone },
        );
        const localEnd = DateTime.fromFormat(
          `${date} ${endTime}`,
          'yyyy-MM-dd HH:mm:ss',
          { zone: timezone },
        );
        const parsedDate = DateTime.fromISO(date, { zone: timezone });

        if (!localStart.isValid || !localEnd.isValid || !parsedDate.isValid) {
          throw new Error('Invalid date or time format.');
        }

        start = localStart.toUTC().toJSDate();
        end = localEnd.toUTC().toJSDate();
        jsParsedDate = parsedDate.toJSDate();
      }

      console.log(`🕒 Final UTC start: ${start.toISOString()}`);
      console.log(`🕒 Final UTC end:   ${end.toISOString()}`);

      const week = getNthWeekdayOfMonth(jsParsedDate);
      const day = jsParsedDate.getDay();

      const scheduleData: any = {
        startTime: start,
        endTime: end,
        booking: { connect: { id: bookingId } },
        service: { connect: { id: serviceId } },
        status: 'scheduled',
        isSkipped,
      };

      if (staffId) {
        scheduleData.staff = { connect: { id: staffId } };

        await this.prisma.staffAvailability.upsert({
          where: {
            staffId_date_startTime_endTime: {
              staffId,
              date: jsParsedDate,
              startTime: start,
              endTime: end,
            },
          },
          update: {
            isAvailable: false,
            updatedAt: new Date(),
          },
          create: {
            staffId,
            date: jsParsedDate,
            dayOfWeek: day,
            weekOfMonth: week,
            startTime: start,
            endTime: end,
            isAvailable: false,
          },
        });
      }

      await this.prisma.schedule.create({ data: scheduleData });
      console.log(`✅ Schedule saved for booking ${bookingId}`);
    } catch (error) {
      console.error('❌ Failed to save schedule:', error.message);
      throw error;
    }
  }

  async isStaffAvailableOnDayAndTime(
    dayOfWeek: number, // 1 = Monday, 7 = Sunday
    time: string, // e.g., "10:00"
    durationMins: number,
  ): Promise<boolean> {
    const [hour, minute] = time.split(':').map(Number);

    const today = DateTime.local().setZone('UTC').startOf('day');
    const currentDay = today.weekday; // 1–7

    let daysToAdd = (dayOfWeek - currentDay + 7) % 7;
    if (daysToAdd === 0) daysToAdd = 7; // always move to next week if same day

    const target = today.plus({ days: daysToAdd }).set({ hour, minute });

    const start = target;
    const end = target.plus({ minutes: durationMins + 30 }); // with buffer

    console.log('🕒 Local Start:', start.toFormat('yyyy-MM-dd HH:mm'));
    console.log('🕒 Local End:', end.toFormat('yyyy-MM-dd HH:mm'));
    console.log('🕒 UTC Start:', start.toUTC().toISO());
    console.log('🕒 UTC End:', end.toUTC().toISO());

    const availableStaff = await this.findAvailableStaffSlot(
      start.toJSDate(), // pass to Prisma as Date
      dayOfWeek,
      start.toJSDate(),
      end.toJSDate(),
    );

    return !!availableStaff;
  }

  /**
   * Check if staff is available for ALL recurring dates within 60 days
   * Used before creating a recurring booking to ensure it can be fulfilled
   */
  async checkStaffAvailabilityForRecurringBooking({
    startDate,
    time,
    dayFrequency,
    durationMins,
    zoneId,
  }: {
    startDate: Date;
    time: string; // HH:mm format
    dayFrequency: number; // days between occurrences
    durationMins: number;
    zoneId: string;
  }): Promise<{
    isAvailable: boolean;
    unavailableDates: Date[];
    checkedDates: Date[];
  }> {
    const [hour, minute] = time.split(':').map(Number);
    const bufferMins = 30;
    const totalDuration = durationMins + bufferMins;
    const daysToCheck = 60;

    // Calculate all recurring dates within 60 days
    const startDateTime = DateTime.fromJSDate(startDate, { zone: 'UTC' }).startOf('day');
    const endDateTime = startDateTime.plus({ days: daysToCheck });

    const recurringDates: Date[] = [];
    let current = startDateTime;

    while (current <= endDateTime) {
      recurringDates.push(current.toJSDate());
      current = current.plus({ days: dayFrequency });
    }

    console.log(`🔍 Checking availability for ${recurringDates.length} recurring dates`);

    // Get all staff in the zone
    const staffInZone = await this.prisma.user.findMany({
      where: {
        role: { name: 'staff' },
        status: 'active',
        staffZone: {
          is: {
            zoneId,
          },
        },
      },
      orderBy: { priority: 'asc' },
      select: { id: true, name: true },
    });

    if (staffInZone.length === 0) {
      console.warn(`❌ No staff found in zone ${zoneId}`);
      return {
        isAvailable: false,
        unavailableDates: recurringDates,
        checkedDates: recurringDates,
      };
    }

    console.log(`👥 Found ${staffInZone.length} staff in zone`);

    const unavailableDates: Date[] = [];

    // Check each recurring date
    for (const date of recurringDates) {
      const startTime = new Date(date);
      startTime.setHours(hour, minute, 0, 0);
      const endTime = new Date(startTime.getTime() + totalDuration * 60000);

      // Check if at least one staff member is available
      const availableStaff = await this.findAvailableStaffSlot(
        date,
        date.getDay(),
        startTime,
        endTime,
        zoneId,
      );

      if (!availableStaff) {
        unavailableDates.push(date);
        console.log(`❌ No staff available on ${date.toISOString().split('T')[0]}`);
      } else {
        console.log(`✅ Staff ${availableStaff.name} available on ${date.toISOString().split('T')[0]}`);
      }
    }

    const isAvailable = unavailableDates.length === 0;

    return {
      isAvailable,
      unavailableDates,
      checkedDates: recurringDates,
    };
  }

  async findAvailableStaffSlot(
    date: Date,
    dayOfWeek: number,
    startTime: Date,
    endTime: Date,
    zoneId?: string,
  ) {
    const isoDate = date.toISOString().split('T')[0]; // extract YYYY-MM-DD
    const dayStart = new Date(`${isoDate}T00:00:00.000Z`);

    // 🔍 Step 1: Get all active staff ordered by priority, filtered by zone
    const where: any = {
      role: { name: 'staff' },
      status: 'active',
    };

    if (zoneId) {
      where.staffZone = {
        is: {
          zoneId,
        },
      };
    }

    const allStaffs = await this.prisma.user.findMany({
      where,
      orderBy: { priority: 'asc' },
      select: { id: true, name: true, priority: true },
    });

    // 📅 Step 2: Check staff availability for the specific date
    const availabilities = await this.prisma.staffAvailability.findMany({
      where: { date: dayStart },
      select: {
        staffId: true,
        startTime: true,
        endTime: true,
        isAvailable: true,
      },
    });

    const unavailableByAvailability = new Set<string>();
    for (const entry of availabilities) {
      if (
        !entry.isAvailable &&
        entry.startTime < endTime &&
        entry.endTime > startTime
      ) {
        unavailableByAvailability.add(entry.staffId);
      }
    }

    // ⏱ Step 3: Check if any staff has overlapping schedules
    const conflictingSchedules = await this.prisma.schedule.findMany({
      where: {
        isSkipped: false, // exclude skipped schedules
        status: { notIn: ['canceled', 'rescheduled'] }, // exclude canceled and rescheduled
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { staffId: true },
    });

    const unavailableBySchedule = new Set(
      conflictingSchedules.map((s) => s.staffId),
    );

    // 🚫 Combine both unavailable sets
    const unavailable = new Set([
      ...unavailableByAvailability,
      ...unavailableBySchedule,
    ]);

    // ✅ Step 4: Pick the first available staff (priority-wise)
    const availableStaff = allStaffs.find(
      (staff) => !unavailable.has(staff.id),
    );

    console.log(
      `🟢 Staff selected: ${availableStaff?.name ?? 'None available'} for ${startTime.toISOString()} - ${endTime.toISOString()}`,
    );

    return availableStaff || null;
  }

  async getRecurringBookingTimeSlots({
    startDate,
    dayOfWeek,
    serviceId,
    durationMins,
    timezone = DEFAULT_TIMEZONE,
    pincode,
  }: {
    startDate: string; // "YYYY-MM-DD"
    dayOfWeek: number; // 0-6 (Sunday to Saturday)
    serviceId: string;
    durationMins?: number;
    timezone?: string;
    pincode?: string;
  }) {
    const bufferMins = 30;
    const defaultDuration = 120;
    const daysToCheck = 60; // simulate 2 months
    const interval = 30;
    const startHour = 9;
    const endHour = 18;

    let zoneId: string | undefined;

    // Validate pincode if provided
    if (pincode) {
      const pincodeRecord = await this.prisma.pincode.findFirst({
        where: {
          code: pincode,
          isActive: true,
          deletedAt: null,
        },
        include: {
          zone: {
            where: {
              isActive: true,
              deletedAt: null,
            },
          },
        },
      });

      if (!pincodeRecord || !pincodeRecord.zone) {
        throw new BadRequestException(
          `Pincode ${pincode} is not currently serviced`,
        );
      }

      zoneId = pincodeRecord.zone.id;
    }

    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
    });

    const totalDuration =
      (durationMins ?? service?.durationMinutes ?? defaultDuration) +
      bufferMins;

    // Filter staff by zone if provided
    const staffWhere: any = {
      role: { name: 'staff' },
    };

    if (zoneId) {
      staffWhere.staffZone = {
        is: {
          zoneId,
        },
      };
    }

    const staffs = await this.prisma.user.findMany({
      where: staffWhere,
      select: { id: true },
    });

    const targetStartDate = DateTime.fromISO(startDate, {
      zone: timezone,
    }).startOf('day');
    const targetEndDate = targetStartDate.plus({ days: daysToCheck });

    const allSlotsMap: Record<
      string,
      { time: string; isAvailable: boolean }[]
    > = {};

    for (let i = 0; i <= daysToCheck; i++) {
      const date = targetStartDate.plus({ days: i });
      if (date.weekday % 7 !== dayOfWeek) continue;

      const dateKey = date.toFormat('yyyy-MM-dd');
      const dailySlots: { time: string; isAvailable: boolean }[] = [];

      const conflictsPerStaff: Record<
        string,
        { start: DateTime; end: DateTime }[]
      > = {};

      for (const staff of staffs) {
        const [unavailabilities, schedules] = await Promise.all([
          this.prisma.staffAvailability.findMany({
            where: {
              staffId: staff.id,
              date: {
                gte: date.toJSDate(),
                lte: date.endOf('day').toJSDate(),
              },
              isAvailable: false,
            },
            select: { date: true, startTime: true, endTime: true },
          }),
          this.prisma.schedule.findMany({
            where: {
              staffId: staff.id,
              startTime: {
                gte: date.toUTC().toJSDate(),
                lte: date.endOf('day').toUTC().toJSDate(),
              },
              status: { in: ['scheduled', 'rescheduled', 'in_progress'] },
            },
            select: { startTime: true, endTime: true },
          }),
        ]);

        conflictsPerStaff[staff.id] = [
          ...unavailabilities.map((u) => {
            const local = DateTime.fromJSDate(u.date, { zone: timezone }).set({
              hour: u.startTime.getHours(),
              minute: u.startTime.getMinutes(),
            });
            const end = local.set({
              hour: u.endTime.getHours(),
              minute: u.endTime.getMinutes(),
            });
            return { start: local.toUTC(), end: end.toUTC() };
          }),
          ...schedules.map((s) => ({
            start: DateTime.fromJSDate(s.startTime).toUTC(),
            end: DateTime.fromJSDate(s.endTime).toUTC(),
          })),
        ];
      }

      let current = date.set({ hour: startHour, minute: 0 });
      while (current.hour < endHour) {
        const endTime = current.plus({ minutes: totalDuration });

        const isAvailable = staffs.some((staff) => {
          const conflicts = conflictsPerStaff[staff.id] || [];
          return !conflicts.some(
            (conflict) =>
              current.toUTC() < conflict.end &&
              endTime.toUTC() > conflict.start,
          );
        });

        dailySlots.push({
          time: current.toFormat('HH:mm'),
          isAvailable,
        });

        current = current.plus({ minutes: interval });
      }

      allSlotsMap[dateKey] = dailySlots;
    }

    return {
      message: 'Recurring booking time slots',
      slots: allSlotsMap,
    };
  }
}

export function getNthWeekdayOfMonth(date: Date): number {
  const day = date.getDay(); // 0 (Sun) - 6 (Sat)
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  let count = 0;

  while (d <= date) {
    if (d.getDay() === day) count++;
    d.setDate(d.getDate() + 1);
  }

  return count; // 1st, 2nd, 3rd... weekday of that type in the month
}
export function formatDate(
  date: Date,
  tz: string = 'America/New_York',
): string {
  return DateTime.fromJSDate(date, { zone: 'utc' })
    .setZone(tz)
    .toFormat('yyyy-LL-dd');
}

export function formatTime(
  date: Date,
  tz: string = 'America/New_York',
): string {
  return DateTime.fromJSDate(date, { zone: 'utc' })
    .setZone(tz)
    .toFormat('HH:mm:ss');
}

export function getDurationFromAreaSize(
  area: number,
  durationMinutes: number,
): number {
  const buffer = Number(60);
  return buffer + (area / 500) * durationMinutes;
}

function generateTimeSlots() {
  const slots = [];
  for (let hour = 8; hour <= 18; hour++) {
    slots.push({
      time: `${hour.toString().padStart(2, '0')}:00`,
      isAvailable: true,
    });
    slots.push({
      time: `${hour.toString().padStart(2, '0')}:30`,
      isAvailable: true,
    });
  }
  return slots;
}

function simulateFutureDates(startDate: Date, frequencyDays: number): Date[] {
  const dates = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i * frequencyDays);
    dates.push(d);
  }
  return dates;
}

function hasConflict(existing: Schedule[], newStart: Date, newEnd: Date) {
  return existing.some(
    (s) => !(newEnd <= s.startTime || newStart >= s.endTime),
  );
}
