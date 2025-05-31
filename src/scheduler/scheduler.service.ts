import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
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

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(isBetween);
// dayjs.extend(isoWeek);
// dayjs.extend(advancedFormat);

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingService: BookingsService,
  ) {}

  async findAvailableStaff(date: Date) {
    const allStaff = await this.prisma.user.findMany({
      where: { role: { name: 'staff' } },
    });

    for (const staff of allStaff) {
      const hasConflict = await this.prisma.schedule.findFirst({
        where: {
          staffId: staff.id,
          startTime: {
            lte: date,
          },
          endTime: {
            gte: date,
          },
        },
      });

      if (!hasConflict) return staff; // Return first available
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

  async getTimeSlots(dayOfWeek: number, durationMins: number = 60) {
    const today = dayjs().utc().startOf('day');

    // Find the next date with the given dayOfWeek
    let targetDate = today.clone();
    while (targetDate.day() !== dayOfWeek) {
      targetDate = targetDate.add(1, 'day');
    }

    const availableStaffCount = await this.prisma.user.count({
      where: { role: { name: 'staff' } },
    });

    const unavailableRanges = await this.prisma.staffAvailability.findMany({
      where: {
        date: targetDate.toDate(),
        dayOfWeek,
        isAvailable: false,
      },
      select: {
        date: true,
        startTime: true,
        endTime: true,
      },
    });

    const startHour = 9;
    const endHour = 18;
    const interval = 30;

    const slots: { time: string; isAvailable: boolean }[] = [];

    let current = targetDate.clone().utc().hour(startHour).minute(0).second(0);

    while (current.hour() < endHour) {
      const timeStr = current.format('HH:mm');
      const serviceEndTime = current.clone().add(durationMins, 'minute');

      const isUnavailable = unavailableRanges.some((range) => {
        const rangeStart = dayjs(range.date)
          .utc()
          .hour(dayjs(range.startTime).utc().hour())
          .minute(dayjs(range.startTime).utc().minute());

        const rangeEnd = dayjs(range.date)
          .utc()
          .hour(dayjs(range.endTime).utc().hour())
          .minute(dayjs(range.endTime).utc().minute());

        return (
          current.isSame(rangeStart) ||
          (current.isAfter(rangeStart) && current.isBefore(rangeEnd)) ||
          (serviceEndTime.isAfter(rangeStart) &&
            (serviceEndTime.isBefore(rangeEnd) ||
              serviceEndTime.isSame(rangeEnd))) ||
          (current.isBefore(rangeStart) && serviceEndTime.isAfter(rangeEnd))
        );
      });

      slots.push({
        time: timeStr,
        isAvailable: availableStaffCount > 0 && !isUnavailable,
      });

      current = current.add(interval, 'minute');
    }

    return slots;
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

  async getTimeSlotswithDate(date: Date, durationMins: number = 60) {
    // Convert the input date to a dayjs object and ensure it is treated as UTC
    const inputDate = dayjs(date).utc().startOf('day'); // Start of the day in UTC, no local time offsets

    // Step 1: Count total available staff
    const availableStaffCount = await this.prisma.user.count({
      where: {
        role: { name: 'staff' },
      },
    });

    // Align the start and end of the day to UTC system's time
    const dayStart = inputDate.toDate(); // Start of the given date in UTC
    const dayEnd = inputDate.endOf('day').toDate(); // End of the day in UTC

    // console.log('Given Date:', date);
    // console.log('Start of Day (UTC):', dayStart);
    // console.log('End of Day (UTC):', dayEnd);

    // Step 2: Get all unavailable ranges for this UTC day
    const unavailableRanges = await this.prisma.staffAvailability.findMany({
      where: {
        date: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      select: {
        date: true,
        startTime: true,
        endTime: true,
      },
    });

    // console.log('Unavailable Ranges:', unavailableRanges);

    // Step 3: Generate slots
    const startHour = 9;
    const endHour = 18;
    const interval = 30; // minutes
    const slots: { time: string; isAvailable: boolean }[] = [];

    let current = inputDate.clone().hour(startHour).minute(0).second(0); // Start at 9 AM in UTC

    while (current.hour() < endHour) {
      const timeStr = current.format('HH:mm');
      const serviceEndTime = current.clone().add(durationMins, 'minute');

      const isUnavailable = unavailableRanges.some((range) => {
        // Convert range start and end times to full dayjs objects in UTC
        const start = dayjs(range.date)
          .hour(dayjs(range.startTime).hour())
          .minute(dayjs(range.startTime).minute())
          .utc(); // Convert to UTC

        const end = dayjs(range.date)
          .hour(dayjs(range.endTime).hour())
          .minute(dayjs(range.endTime).minute())
          .utc(); // Convert to UTC

        // Compare using UTC time for both current and unavailable times
        return (
          current.isSame(start) ||
          (current.isAfter(start) && current.isBefore(end)) ||
          (serviceEndTime.isAfter(start) &&
            (serviceEndTime.isBefore(end) || serviceEndTime.isSame(end))) ||
          (current.isBefore(start) && serviceEndTime.isAfter(end))
        );
      });

      slots.push({
        time: timeStr,
        isAvailable: availableStaffCount > 0 && !isUnavailable,
      });

      current = current.add(interval, 'minute');
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
      include: { booking: true },
    });
    if (!scheduleExist) {
      throw new NotFoundException('Shedule Not Found');
    }
    const schedule = await this.prisma.schedule.update({
      where: { id },
      data: { status },
    });
    if (
      scheduleExist.booking.type == 'one_time' &&
      (status == 'canceled' || status == 'completed')
    ) {
      await this.bookingService.cancelorComplete(
        scheduleExist.bookingId,
        userId,
        role,
        status,
      );
    }
    return schedule;
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

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        schedules: true,
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    const existingSchedule = await this.prisma.schedule.findFirst({
      where: {
        bookingId,
        startTime: {
          gt: new Date(), // Future schedule
        },
      },
    });

    if (!existingSchedule) {
      throw new NotFoundException(
        'No upcoming schedule found for this booking',
      );
    }

    // Combine newDate + time into a datetime
    const startTime = dayjs(`${newDate}T${time}`).toDate();

    if (!startTime || isNaN(startTime.getTime())) {
      throw new BadRequestException('Invalid date or time');
    }

    // Assume same duration as existing schedule
    const durationMs =
      new Date(existingSchedule.endTime).getTime() -
      new Date(existingSchedule.startTime).getTime();
    const endTime = new Date(startTime.getTime() + durationMs);

    const threeDaysFromNow = dayjs().add(3, 'day');
    if (dayjs(startTime).isBefore(threeDaysFromNow)) {
      throw new BadRequestException(
        'New schedule must be at least 3 days in the future',
      );
    }

    // Check staff conflict
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

    // Skip or cancel the old schedule
    await this.prisma.schedule.update({
      where: { id: existingSchedule.id },
      data: {
        status: ScheduleStatus.rescheduled,
      },
    });

    // Create new schedule
    return this.prisma.schedule.create({
      data: {
        staffId: existingSchedule.staffId,
        bookingId,
        serviceId: existingSchedule.serviceId,
        startTime,
        endTime,
        //actualStartTime: startTime,
        //actualEndTime: endTime,
        status: ScheduleStatus.scheduled,
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
    date: Date,
    time: string,
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true },
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    const [hours, minutes] = time.split(':').map(Number);
    const startDate = new Date(date);
    startDate.setHours(hours, minutes, 0, 0);

    const duration = booking.service?.durationMinutes || 120;
    const endDate = dayjs(startDate).add(duration, 'minute').toDate();

    const staff = await this.prisma.user.findFirst({
      where: {
        role: {
          name: 'staff', // Ensure your Prisma schema supports filtering this way (or adjust if needed)
        },
      },
    });

    if (!staff) {
      throw new Error('No staff found');
    }

    await this.prisma.schedule.create({
      data: {
        bookingId: booking.id,
        staffId: staff.id,
        serviceId: booking.serviceId,
        startTime: startDate,
        endTime: endDate,
        status: ScheduleStatus.scheduled,
      },
    });
  }

  async generateSchedulesForBooking(
    bookingId: string,
    numberOfDays: number = 7,
    specificDate?: Date, // Optional override for one-time bookings
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { monthSchedules: true, service: true },
    });

    if (!booking) {
      throw new Error(`Booking with ID ${bookingId} not found.`);
    }

    const isOneTime = booking.type === 'one_time';

    // One-time booking flow
    if (isOneTime && specificDate) {
      const specificDateObj = new Date(specificDate);

      if (isNaN(specificDateObj.getTime())) {
        throw new Error(`Invalid specificDate provided: ${specificDate}`);
      }

      const alreadyScheduled = await this.checkIfBookingScheduled(
        booking.id,
        specificDateObj,
      );
      if (alreadyScheduled) return;

      const [hours, minutes] = specificDateObj
        .toTimeString()
        .slice(0, 5)
        .split(':')
        .map(Number);

      const startDateTime = new Date(specificDateObj);
      startDateTime.setUTCHours(hours || 9, minutes || 0, 0);

      const durationMins = getDurationFromAreaSize(
        booking.areaSize,
        booking.service.durationMinutes,
      );
      const endDateTime = new Date(
        startDateTime.getTime() + durationMins * 60 * 1000,
      );

      const availableStaff = await this.findAvailableStaffSlot(
        specificDateObj,
        specificDateObj.getDay(),
        startDateTime,
        endDateTime,
      );
      if (!availableStaff) return;

      await this.saveSchedule({
        date: formatDate(specificDateObj),
        startTime: formatTime(startDateTime),
        endTime: formatTime(endDateTime),
        bookingId: booking.id,
        staffId: availableStaff.id,
        serviceId: booking.service.id,
      });

      return;
    }

    // Recurring booking flow
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + numberOfDays);

    for (let i = 0; i <= numberOfDays; i++) {
      const currentDate = new Date(today);
      currentDate.setDate(today.getDate() + i);
      const currentDayOfWeek = currentDate.getDay();
      const currentWeekOfMonth = Math.ceil(currentDate.getDate() / 7);

      const matchingSchedules = booking.monthSchedules.filter(
        (ms) =>
          ms.dayOfWeek === currentDayOfWeek &&
          (!ms.weekOfMonth || ms.weekOfMonth === currentWeekOfMonth) &&
          !ms.skip,
      );

      if (matchingSchedules.length === 0) continue;

      const alreadyScheduled = await this.checkIfBookingScheduled(
        booking.id,
        currentDate,
      );
      if (alreadyScheduled) continue;

      await Promise.all(
        matchingSchedules.map(async (ms) => {
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
            currentDayOfWeek,
            startDateTime,
            endDateTime,
          );
          if (!availableStaff) return;

          await this.saveSchedule({
            date: formatDate(currentDate),
            startTime: formatTime(startDateTime),
            endTime: formatTime(endDateTime),
            bookingId: booking.id,
            staffId: availableStaff.id,
            serviceId: booking.service.id,
          });
        }),
      );
    }
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
      },
    });
  }

  async saveSchedule(params: {
    date: string;
    startTime: string;
    endTime: string;
    bookingId: string;
    staffId: string;
    serviceId: string;
  }) {
    const { date, startTime, endTime, bookingId, staffId } = params;

    const currentDate = new Date(date);
    const week = getNthWeekdayOfMonth(currentDate);
    const day = currentDate.getDay();

    await this.prisma.schedule.create({
      data: {
        startTime: new Date(`${params.date}T${params.startTime}`),
        endTime: new Date(`${params.date}T${params.endTime}`),
        booking: {
          connect: { id: params.bookingId },
        },
        service: {
          connect: { id: params.serviceId },
        },
        staff: {
          connect: { id: params.staffId },
        },
        status: 'scheduled',
      },
    });

    await this.prisma.staffAvailability.create({
      data: {
        date: new Date(date),
        dayOfWeek: day,
        weekOfMonth: week,
        staffId: params.staffId,
        startTime: new Date(`${params.date}T${params.startTime}`),
        endTime: new Date(`${params.date}T${params.endTime}`),
        isAvailable: false,
      },
    });
  }

  async findAvailableStaffSlot(
    date: Date,
    dayOfWeek: number,
    startTime: Date,
    endTime: Date,
  ) {
    const unavailableStaffSlots = await this.prisma.staffAvailability.findMany({
      where: {
        date: date,
        dayOfWeek,
        isAvailable: false,
        OR: [
          {
            startTime: {
              lte: endTime,
            },
            endTime: {
              gt: startTime,
            },
          },
          {
            startTime: {
              lt: startTime,
            },
            endTime: {
              gte: endTime,
            },
          },
        ],
      },
    });

    const unavailableStaffIds = unavailableStaffSlots.map((us) => us.staffId);

    const availableStaffs = await this.prisma.user.findMany({
      where: {
        id: {
          notIn: unavailableStaffIds.length
            ? unavailableStaffIds
            : ['notADummyStaff'],
        },
        role: { name: 'staff' },
      },
    });

    if (!availableStaffs.length) return null;

    const randomIndex = Math.floor(Math.random() * availableStaffs.length);
    return availableStaffs[randomIndex];
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

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatTime(date: Date): string {
  return date.toTimeString().split(' ')[0];
}

export function getDurationFromAreaSize(
  area: number,
  durationMinutes: number,
): number {
  const buffer = Number(60);
  return buffer + 60 + Math.ceil((area - 1000) / 500) * durationMinutes;
}
