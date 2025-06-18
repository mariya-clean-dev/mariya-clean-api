import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { Prisma, TransactionStatus } from '@prisma/client';
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
import { DateTime } from 'luxon';

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
  ) {}

  async findAvailableStaff(startTime: Date, endTime: Date) {
    const allStaff = await this.prisma.user.findMany({
      where: { role: { name: 'staff' } },
      orderBy: { priority: 'asc' },
    });
    for (const staff of allStaff) {
      const hasConflict = await this.prisma.schedule.findFirst({
        where: {
          staffId: staff.id,
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
        const parsedStart = new Date(startDate);
        if (!isNaN(parsedStart.getTime())) {
          where.startTime.gte = parsedStart;
        }
      }

      if (endDate) {
        const parsedEnd = new Date(endDate);
        if (!isNaN(parsedEnd.getTime())) {
          where.startTime.lte = parsedEnd;
        }
      }
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.schedule.findMany({
        where,
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
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // async getTimeSlots(
  //   weekOfMonth: number,
  //   dayOfWeek: number,
  //   durationMins: number = 60,
  // ) {
  //   const today = dayjs().utc().startOf('day');
  //   const thirtyDaysLater = today.add(30, 'day');

  //   const availableStaffCount = await this.prisma.user.count({
  //     where: { role: { name: 'staff' } },
  //   });

  //   const unavailableRanges = await this.prisma.staffAvailability.findMany({
  //     where: {
  //       date: {
  //         gte: today.toDate(),
  //         lte: thirtyDaysLater.toDate(),
  //       },
  //       weekOfMonth,
  //       dayOfWeek,
  //       isAvailable: false,
  //     },
  //     select: {
  //       date: true,
  //       startTime: true,
  //       endTime: true,
  //     },
  //   });

  //   const matchingDates: dayjs.Dayjs[] = [];
  //   let pointer = today.clone();

  //   while (pointer.isBefore(thirtyDaysLater)) {
  //     const currentWeekOfMonth = Math.ceil(pointer.date() / 7);
  //     const currentDayOfWeek = pointer.day();
  //     if (
  //       currentWeekOfMonth === weekOfMonth &&
  //       currentDayOfWeek === dayOfWeek
  //     ) {
  //       matchingDates.push(pointer.clone());
  //     }
  //     pointer = pointer.add(1, 'day');
  //   }

  //   const startHour = 9;
  //   const endHour = 18;
  //   const interval = 30;
  //   const slots: { time: string; isAvailable: boolean }[] = [];

  //   for (const date of matchingDates) {
  //     let current = date.clone().utc().hour(startHour).minute(0).second(0);

  //     while (current.hour() < endHour) {
  //       const timeStr = current.format('HH:mm');
  //       const serviceEndTime = current.clone().add(durationMins, 'minute');

  //       const isUnavailable = unavailableRanges.some((range) => {
  //         const sameDay = dayjs(range.date).utc().isSame(current, 'day');
  //         if (!sameDay) return false;

  //         const rangeStart = dayjs(range.date)
  //           .utc()
  //           .hour(dayjs(range.startTime).utc().hour())
  //           .minute(dayjs(range.startTime).utc().minute());

  //         const rangeEnd = dayjs(range.date)
  //           .utc()
  //           .hour(dayjs(range.endTime).utc().hour())
  //           .minute(dayjs(range.endTime).utc().minute());

  //         return (
  //           current.isSame(rangeStart) ||
  //           (current.isAfter(rangeStart) && current.isBefore(rangeEnd)) ||
  //           (serviceEndTime.isAfter(rangeStart) &&
  //             (serviceEndTime.isBefore(rangeEnd) ||
  //               serviceEndTime.isSame(rangeEnd))) ||
  //           (current.isBefore(rangeStart) && serviceEndTime.isAfter(rangeEnd))
  //         );
  //       });

  //       slots.push({
  //         time: timeStr,
  //         isAvailable: availableStaffCount > 0 && !isUnavailable,
  //       });

  //       current = current.add(interval, 'minute');
  //     }
  //   }

  //   return slots;
  // }
  private parseTime(date: Date) {
    // Extract UTC hours and minutes from Date
    return { h: date.getUTCHours(), m: date.getUTCMinutes() };
  }

  async getTimeSlots({
    date,
    dayOfWeek,
    durationMins,
    serviceId,
    timezone = DEFAULT_TIMEZONE,
  }: {
    date?: Date;
    dayOfWeek?: number;
    durationMins?: number;
    serviceId?: string;
    timezone?: string;
  }) {
    const bufferMins = 30;
    const defaultDuration = durationMins ? durationMins : 120;

    // 1. Determine target date (preserve UTC, then shift to timezone)
    let targetDate: DateTime;
    if (date) {
      const dateUtc = DateTime.fromJSDate(date).setZone(timezone, {
        keepLocalTime: true,
      });
      targetDate = dateUtc.setZone(timezone).startOf('day');
    } else if (dayOfWeek !== undefined) {
      targetDate = DateTime.now().setZone(timezone).startOf('day');
      while (targetDate.weekday % 7 !== dayOfWeek) {
        targetDate = targetDate.plus({ days: 1 });
      }
    } else {
      throw new BadRequestException(
        'Either date or dayOfWeek must be provided',
      );
    }

    console.log(`📅 Local date: ${targetDate.toISO()}`);
    console.log(
      `🌐 UTC range: ${targetDate.toUTC().toISO()} → ${targetDate.endOf('day').toUTC().toISO()}`,
    );

    // 2. Duration with buffer
    let totalDuration = durationMins;
    if (!totalDuration && serviceId) {
      const service = await this.prisma.service.findUnique({
        where: { id: serviceId },
      });
      totalDuration = service?.durationMinutes ?? defaultDuration;
    }
    totalDuration += bufferMins;

    console.log(`🕐 Total slot duration (with buffer): ${totalDuration}`);

    // 3. Get staff list
    const staffs = await this.prisma.user.findMany({
      where: { role: { name: 'staff' } },
      select: { id: true },
    });

    console.log(`👥 Total staff: ${staffs.length}`);

    // 4. Get conflicts for each staff
    const staffConflictMap: Record<
      string,
      { start: DateTime; end: DateTime }[]
    > = {};

    for (const staff of staffs) {
      const [unavailabilities, schedules] = await Promise.all([
        this.prisma.staffAvailability.findMany({
          where: {
            staffId: staff.id,
            date: {
              gte: targetDate.toJSDate(),
              lte: targetDate.endOf('day').toJSDate(),
            },
            isAvailable: false,
          },
          select: { date: true, startTime: true, endTime: true },
        }),
        this.prisma.schedule.findMany({
          where: {
            staffId: staff.id,
            startTime: {
              gte: targetDate.toUTC().toJSDate(),
              lte: targetDate.endOf('day').toUTC().toJSDate(),
            },
            status: { in: ['scheduled', 'rescheduled', 'in_progress'] },
          },
          select: { startTime: true, endTime: true },
        }),
      ]);

      const conflicts = [
        ...unavailabilities.map((u) => {
          const localDate = DateTime.fromJSDate(u.date, { zone: timezone });
          const start = localDate
            .set({
              hour: u.startTime.getHours(),
              minute: u.startTime.getMinutes(),
            })
            .setZone('utc');
          const end = localDate
            .set({ hour: u.endTime.getHours(), minute: u.endTime.getMinutes() })
            .setZone('utc');

          console.log(`🔒 Unavailable UTC: ${start.toISO()} → ${end.toISO()}`);
          return { start, end };
        }),
        ...schedules.map((s) => {
          const start = DateTime.fromJSDate(s.startTime).toUTC();
          const end = DateTime.fromJSDate(s.endTime).toUTC();
          console.log(`📅 Scheduled: ${start.toISO()} → ${end.toISO()}`);
          return { start, end };
        }),
      ];

      staffConflictMap[staff.id] = conflicts;
      console.log(`⚠️ Conflicts for staff ${staff.id}:`, conflicts);
    }

    // 5. Generate slots in user's timezone
    const startHour = 9;
    const endHour = 18;
    const interval = 30;
    const slots: { time: string; isAvailable: boolean }[] = [];

    let current = targetDate.set({ hour: startHour, minute: 0 });

    while (current.hour < endHour) {
      const endTime = current.plus({ minutes: totalDuration });

      const isAvailable = staffs.some((staff) => {
        const conflicts = staffConflictMap[staff.id] || [];
        const hasConflict = conflicts.some(
          (range) =>
            current.toUTC() < range.end && endTime.toUTC() > range.start,
        );
        return !hasConflict;
      });

      console.log(
        `🕑 Slot: ${current.toUTC().toISO()} → ${endTime.toUTC().toISO()} - ${
          isAvailable ? '✅ Available' : '❌ Unavailable'
        }`,
      );

      slots.push({
        time: current.toFormat('HH:mm'), // local timezone format
        isAvailable,
      });

      current = current.plus({ minutes: interval });
    }

    return slots;
  }

  async createMonthSchedules(schedules: CreateMonthScheduleDto[]) {
    const created = await this.prisma.monthSchedule.createMany({
      data: schedules,
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

  async updateSheduleStatus(
    id: string,
    status: ScheduleStatus,
    userId: string,
    role: string,
  ) {
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
    if (!booking) return scheduleExist;

    const isCompleted = status === 'completed';
    const isCanceled = status === 'canceled';
    const isOnlinePayment = booking.paymentMethod === 'online';

    let updatedSchedule;

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
        // Charge the saved payment method
        const paymentIntent = await this.stripeService.chargeSavedCard({
          customerId: stripeCustomerId,
          amount: amountInCents,
          currency,
          paymentMethodId,
        });

        // Mark the schedule as paid
        updatedSchedule = await this.prisma.schedule.update({
          where: { id },
          data: { status: ScheduleStatus.completed },
        });

        // Record transaction
        await this.prisma.transaction.create({
          data: {
            bookingId: booking.id,
            stripePaymentId: paymentIntent.id,
            amount: new Prisma.Decimal(amountInCents / 100), // dollars
            currency,
            status: 'successful',
            paymentMethod: 'card',
            transactionType: 'charge',
          },
        });
      } catch (err) {
        // Log failed transaction
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

        throw new BadRequestException('Stripe payment failed: ' + err.message);
      }
    } else {
      // Just update status normally if not online payment
      updatedSchedule = await this.prisma.schedule.update({
        where: { id },
        data: { status },
      });
    }

    if (isCompleted && !isOnlinePayment) {
      // Create a manual successful transaction record (e.g., cash payment)
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

    // Complete or cancel one-time bookings
    if (booking.type === 'one_time' && (isCompleted || isCanceled)) {
      await this.bookingService.cancelorComplete(
        booking.id,
        userId,
        role,
        status,
      );
    }

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

    return {
      message: 'Booking successfully rescheduled',
      rescheduled: updatedOldSchedule,
      newSchedule,
    };
  }

  private async getNextScheduleForBooking(bookingId: string) {
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
    targetDate.setDate(today.getDate() + 45);

    await this.generateSchedulesForDate(today, targetDate);

    this.logger.log('Auto-Scheduler completed.');
  }

  async generateSchedulesForDate(
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    for (
      let currentDate = new Date(startDate);
      currentDate <= new Date(endDate);
      currentDate.setUTCDate(currentDate.getUTCDate() + 1)
    ) {
      //const week = getNthWeekdayOfMonth(currentDate);
      const day = currentDate.getDay();

      // console.log(currentDate, day, week);

      const bookings = await this.prisma.booking.findMany({
        where: {
          type: ServiceType.recurring,
          monthSchedules: {
            some: {
              dayOfWeek: day,
              skip: false,
            },
          },
        },
        include: { monthSchedules: true, service: true },
      });
      for (const booking of bookings) {
        const schedulesForDay = booking.monthSchedules.filter(
          (ms: any) => ms.dayOfWeek === day && !ms.skip,
        );
        if (schedulesForDay.length === 0) continue;

        const alreadyScheduled = await this.checkIfBookingScheduled(
          booking.id,
          currentDate,
        );
        if (alreadyScheduled) continue;

        for (const ms of schedulesForDay) {
          const [hours, minutes] = ms.time.split(':').map(Number);
          const startDateTime = new Date(currentDate);
          startDateTime.setUTCHours(hours, minutes, 0);

          const durationMins = getDurationFromAreaSize(
            booking.areaSize,
            booking.service.durationMinutes,
          );
          const endDateTime = new Date(
            startDateTime.getTime() + durationMins * 60 * 1000,
          );

          const availableStaff = await this.findAvailableStaffSlot(
            currentDate,
            day,
            startDateTime,
            endDateTime,
          );

          if (!availableStaff) continue;

          await this.saveSchedule({
            date: formatDate(currentDate),
            startTime: formatTime(startDateTime),
            endTime: formatTime(endDateTime),
            bookingId: booking.id,
            staffId: availableStaff.id,
            serviceId: booking.service.id,
          });
        }
      }
    }
  }

  async generateOneTimeScheduleForBooking(
    bookingId: string,
    date: Date, // exact date (local or UTC) passed in
    time: string, // e.g. "10:00"
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true },
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    const timezone = 'America/New_York';

    const localStart = DateTime.fromISO(
      `${date.toISOString().split('T')[0]}T${time}`,
      {
        zone: timezone,
      },
    );
    const startDateTime = localStart.toUTC().toJSDate();

    const durationMins = getDurationFromAreaSize(
      booking.areaSize,
      booking.service.durationMinutes,
    );
    const endDateTime = new Date(
      startDateTime.getTime() + (durationMins + 30) * 60 * 1000,
    );

    const dayOfWeek = startDateTime.getUTCDay();

    const availableStaff = await this.findAvailableStaffSlot(
      startDateTime,
      dayOfWeek,
      startDateTime,
      endDateTime,
    );

    console.log(startDateTime, endDateTime, availableStaff || 'No staff');

    // Even if no staff is available, save the schedule without staff assignment
    await this.saveSchedule({
      date: formatDate(startDateTime),
      startTime: formatTime(startDateTime),
      endTime: formatTime(endDateTime),
      bookingId: booking.id,
      staffId: availableStaff?.id ?? null, // <== assign null if no staff
      serviceId: booking.service.id,
    });
  }

  async generateSchedulesForBooking(
    bookingId: string,
    durationInDays: number = 30,
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
        recurringType: true,
        monthSchedules: true,
      },
    });

    if (!booking || booking.type !== 'recurring') return;

    const { recurringType, service, areaSize, monthSchedules } = booking;
    const dayFrequency = recurringType?.dayFrequency ?? 7;

    // Use first non-skipped month schedule to determine starting dayOfWeek
    const scheduleTemplate = monthSchedules.find((ms) => !ms.skip);
    if (!scheduleTemplate) return;

    const { dayOfWeek, time } = scheduleTemplate;
    const [hours, minutes] = time.split(':').map(Number);

    let nextDate = this.getNextDateByDayOfWeek(dayOfWeek); // updated logic
    const endDate = new Date(nextDate);
    endDate.setDate(endDate.getDate() + durationInDays);

    while (nextDate <= endDate) {
      const alreadyExists = await this.checkIfBookingScheduled(
        booking.id,
        nextDate,
      );
      if (alreadyExists) {
        nextDate.setDate(nextDate.getDate() + dayFrequency);
        continue;
      }

      const startDateTime = new Date(nextDate);
      startDateTime.setUTCHours(hours, minutes, 0);

      const durationMins = getDurationFromAreaSize(
        areaSize,
        service.durationMinutes,
      );
      const endDateTime = new Date(
        startDateTime.getTime() + (durationMins + 30) * 60 * 1000,
      );

      const availableStaff = await this.findAvailableStaffSlot(
        nextDate,
        dayOfWeek,
        startDateTime,
        endDateTime,
      );
      if (availableStaff) {
        await this.saveSchedule({
          date: formatDate(nextDate),
          startTime: formatTime(startDateTime),
          endTime: formatTime(endDateTime),
          bookingId: booking.id,
          staffId: availableStaff.id,
          serviceId: service.id,
        });
      }

      nextDate.setDate(nextDate.getDate() + dayFrequency);
    }
  }

  getNextDateByDayOfWeekLuxon(dayOfWeek: number, timezone: string): DateTime {
    const now = DateTime.now().setZone(timezone).startOf('day');
    let daysToAdd = (dayOfWeek - now.weekday + 7) % 7;
    if (daysToAdd === 0) daysToAdd = 7; // always pick *next* matching weekday
    return now.plus({ days: daysToAdd });
  }

  private getWeekdayName(day: number): string {
    const names = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    return names[day] || 'Invalid';
  }

  // Helper functions (for context):
  private getNextDateByDayOfWeek(dayOfWeek: number): Date {
    const today = new Date();
    const currentDay = today.getDay(); // Sunday = 0, Monday = 1, ..., Saturday = 6

    // Calculate how many days to add
    const daysToAdd = (dayOfWeek + 7 - currentDay) % 7 || 7;

    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysToAdd);
    nextDate.setHours(0, 0, 0, 0);
    return nextDate;
  }

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
      },
    });
  }

  async saveSchedule(params: {
    date: string; // format: 'yyyy-MM-dd'
    startTime: string; // format: 'HH:mm'
    endTime: string; // format: 'HH:mm'
    bookingId: string;
    staffId?: string | null;
    serviceId: string;
    timezone?: string; // optional, default to UTC
  }) {
    const {
      date,
      startTime,
      endTime,
      bookingId,
      staffId,
      serviceId,
      timezone = 'America/New_York',
    } = params;

    console.log('Parsing schedule with:', {
      date,
      startTime,
      endTime,
      timezone,
    });

    // Validate input
    if (!date || !startTime || !endTime) {
      throw new Error('Invalid schedule: Missing date, startTime, or endTime.');
    }

    // Parse using Luxon in the given timezone
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
      throw new Error('Invalid schedule: Unable to parse date/time.');
    }

    // Convert to JS Dates in UTC for DB storage
    const start = localStart.toUTC().toJSDate();
    const end = localEnd.toUTC().toJSDate();
    const jsParsedDate = parsedDate.toJSDate(); // used for staff availability

    const week = getNthWeekdayOfMonth(jsParsedDate);
    const day = jsParsedDate.getDay();

    const scheduleData: any = {
      startTime: start,
      endTime: end,
      booking: { connect: { id: bookingId } },
      service: { connect: { id: serviceId } },
      status: 'scheduled',
    };

    if (staffId) {
      scheduleData.staff = { connect: { id: staffId } };
    }

    // Create schedule
    await this.prisma.schedule.create({ data: scheduleData });

    // Update staff availability if applicable
    if (staffId) {
      try {
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
      } catch (error) {
        console.warn('Availability upsert failed:', error.message);
      }
    }
  }

  async findAvailableStaffSlot(
    date: Date,
    dayOfWeek: number,
    startTime: Date,
    endTime: Date,
  ) {
    function toComparableTime(dt: Date) {
      const timeStr = dt.toISOString().slice(11, 19); // "HH:mm:ss"
      return new Date(`1970-01-01T${timeStr}Z`);
    }

    const startComparable = toComparableTime(startTime);
    const endComparable = toComparableTime(endTime);

    const allStaffs = await this.prisma.user.findMany({
      where: { role: { name: 'staff' } },
      orderBy: { priority: 'asc' },
      select: { id: true, name: true, priority: true },
    });

    const availabilities = await this.prisma.staffAvailability.findMany({
      where: date ? { date } : { dayOfWeek },
      select: {
        staffId: true,
        startTime: true,
        endTime: true,
        isAvailable: true,
      },
    });

    const unavailableStaffIds = new Set<string>();

    for (const availability of availabilities) {
      if (!availability.isAvailable) {
        const availStart = toComparableTime(availability.startTime);
        const availEnd = toComparableTime(availability.endTime);

        const overlaps =
          availStart < endComparable && availEnd > startComparable;

        if (overlaps) {
          unavailableStaffIds.add(availability.staffId);
        }
      }
    }

    const availableStaff = allStaffs.find(
      (staff) => !unavailableStaffIds.has(staff.id),
    );

    return availableStaff || null;
  }

  async getRecurringBookingTimeSlots({
    startDate,
    dayOfWeek,
    serviceId,
    durationMins,
    timezone = DEFAULT_TIMEZONE,
  }: {
    startDate: string; // "YYYY-MM-DD"
    dayOfWeek: number; // 0-6 (Sunday to Saturday)
    serviceId: string;
    durationMins?: number;
    timezone?: string;
  }) {
    const bufferMins = 30;
    const defaultDuration = 120;
    const daysToCheck = 60; // simulate 2 months
    const interval = 30;
    const startHour = 9;
    const endHour = 18;

    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
    });

    const totalDuration =
      (durationMins ?? service?.durationMinutes ?? defaultDuration) +
      bufferMins;

    const staffs = await this.prisma.user.findMany({
      where: { role: { name: 'staff' } },
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
  return buffer + 60 + Math.ceil((area - 1000) / 500) * durationMinutes;
}
