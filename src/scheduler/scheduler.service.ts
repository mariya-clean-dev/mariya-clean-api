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
import { ScheduleStatus, User } from '@prisma/client';
import { RescheduleDto } from './dto/reschedule.dto';
import { Booking } from 'src/bookings/entities/booking.entity';
import isBetween from 'dayjs/plugin/isBetween';
dayjs.extend(isBetween);
// dayjs.extend(isoWeek);
// dayjs.extend(advancedFormat);

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createSchedule(createScheduleDto: CreateScheduleDto) {
    // Check if staff exists
    const staff = await this.prisma.user.findFirst({
      where: {
        id: createScheduleDto.staffId,
        role: {
          name: 'staff',
        },
      },
    });

    if (!staff) {
      throw new NotFoundException(
        `Staff with ID ${createScheduleDto.staffId} not found`,
      );
    }

    // If booking ID is provided, check if it exists
    if (createScheduleDto.bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: createScheduleDto.bookingId },
      });

      if (!booking) {
        throw new NotFoundException(
          `Booking with ID ${createScheduleDto.bookingId} not found`,
        );
      }
    }

    // Parse dates
    const startTime = new Date(createScheduleDto.startTime);
    const endTime = new Date(createScheduleDto.endTime);
    const actualStartTime = new Date(createScheduleDto.startTime);
    const actualEndTime = new Date(createScheduleDto.endTime);
    // Validate time range
    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    // Check for schedule conflicts
    const conflictingSchedule = await this.prisma.schedule.findFirst({
      where: {
        staffId: createScheduleDto.staffId,
        OR: [
          // New schedule starts during existing schedule
          {
            startTime: { lte: startTime },
            endTime: { gt: startTime },
          },
          // New schedule ends during existing schedule
          {
            startTime: { lt: endTime },
            endTime: { gte: endTime },
          },
          // New schedule entirely contains existing schedule
          {
            startTime: { gte: startTime },
            endTime: { lte: endTime },
          },
        ],
      },
    });

    if (conflictingSchedule) {
      throw new BadRequestException(
        'Schedule conflicts with an existing schedule',
      );
    }

    // Create schedule
    return this.prisma.schedule.create({
      data: {
        staff: {
          connect: { id: createScheduleDto.staffId },
        },
        booking: {
          connect: { id: createScheduleDto.bookingId },
        },
        service: {
          connect: { id: createScheduleDto.serviceId },
        },
        status: createScheduleDto.status || ScheduleStatus.scheduled,
        startTime,
        endTime,
        actualStartTime,
        actualEndTime,
      },
    });
  }

  async getAvailableStaffs(start: Date, end: Date): Promise<User[]> {
    const staffList = await this.prisma.user.findMany({
      where: {
        role: {
          name: 'staff',
        },
      },
    });

    const available: User[] = [];

    for (const staff of staffList) {
      const hasConflict = await this.prisma.schedule.findFirst({
        where: {
          staffId: staff.id,
          startTime: { lt: end },
          endTime: { gt: start },
        },
      });

      if (!hasConflict) {
        available.push(staff);
      }
    }

    return available;
  }

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

  async findMonthSchedules(startDate: Date, endDate: Date) {
    let where: any;
    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        where.startTime.gte = startDate;
      }
      if (endDate) {
        where.startTime.lte = endDate;
      }
    }
    return this.prisma.monthSchedule.findMany({
      where,
    });
  }

  async getTimeSlots(
    weekOfMonth: number,
    dayOfWeek: number,
    durationMins: number = 60, // Default service duration
  ) {
    const today = new Date();
    const thirtyDaysLater = dayjs(today).add(30, 'day').toDate();

    const availableStaffCount = await this.prisma.user.count({
      where: {
        role: {
          name: 'staff',
        },
      },
    });

    const unavailableRanges = await this.prisma.staffAvailability.findMany({
      where: {
        date: {
          gte: today,
          lte: thirtyDaysLater,
        },
        weekOfMonth,
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
    const interval = 30; // 30-minute gap for slot intervals

    const slots: { time: string; isAvailable: boolean }[] = [];

    let current = dayjs().startOf('day').hour(startHour).minute(0).second(0);

    // Iterate through each 30-minute time slot
    while (
      current.hour() < endHour ||
      (current.hour() === endHour && current.minute() === 0)
    ) {
      const timeStr = current.format('HH:mm');

      // Calculate the service end time based on the duration
      const serviceEndTime = current.add(durationMins, 'minute');

      // Check if the service duration overlaps with any unavailable ranges
      const isUnavailable = unavailableRanges.some((range) => {
        const rangeStart = dayjs(range.startTime);
        const rangeEnd = dayjs(range.endTime);

        // Check if the service start or end time falls within the unavailable ranges
        return (
          current.isBetween(rangeStart, rangeEnd, null, '[)') || // Service start overlaps with unavailable range
          serviceEndTime.isBetween(rangeStart, rangeEnd, null, '(]') || // Service end overlaps with unavailable range
          (current.isBefore(rangeStart) && serviceEndTime.isAfter(rangeEnd)) // Service duration completely overlaps the range
        );
      });

      // Only add available slots if there is available staff and no time conflicts
      if (availableStaffCount > 0 && !isUnavailable) {
        slots.push({ time: timeStr, isAvailable: true });
      } else {
        slots.push({ time: timeStr, isAvailable: false });
      }

      // Move to the next slot with the specified interval (30 minutes)
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

  async updateSheduleStatus(id: string, status: ScheduleStatus) {
    const schedule = await this.prisma.schedule.update({
      where: { id },
      data: { status },
    });
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
    //let currentDate = new Date(startDate);
    for (
      let currentDate = new Date(startDate);
      currentDate <= new Date(endDate);
      currentDate.setDate(currentDate.getDate() + 1)
    ) {
      // console.log({ currentDate: currentDate });
      const week = getNthWeekdayOfMonth(currentDate);
      if (week === 5) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }
      const day = currentDate.getDay();

      const bookings = await this.prisma.booking.findMany({
        where: {
          monthSchedules: {
            some: {
              weekOfMonth: week,
              dayOfWeek: day,
              skip: false, // Optional: to filter out skipped schedules
            },
          },
        },
        include: { monthSchedules: true, service: true },
      });
      for (const booking of bookings) {
        const schedulesForDay = booking.monthSchedules.filter(
          (ms: any) =>
            ms.weekOfMonth === week && ms.dayOfWeek === day && !ms.skip,
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
          startDateTime.setHours(hours, minutes, 0);
          const durationMins = getDurationFromAreaSize(
            booking.areaSize,
            booking.service.durationMinutes,
          );
          const endDateTime = new Date(
            startDateTime.getTime() + durationMins * 60 * 1000,
          );

          const availableStaff = await this.findAvailableStaffSlot(
            ms.weekOfMonth,
            ms.dayOfWeek,
            startDateTime,
            endDateTime,
          );

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

  async generateSchedulesForBooking(
    bookingId: string,
    numberOfDays: number = 30,
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { monthSchedules: true, service: true },
    });

    if (!booking) {
      throw new Error(`Booking with ID ${bookingId} not found.`);
    }

    const today = new Date();
    let endDate = new Date(today);
    endDate.setDate(today.getDate() + numberOfDays); // Calculate the end date based on number of days

    // Loop through the number of days (i.e., for the range of days starting from today)
    for (
      let currentDate = new Date(today);
      currentDate <= endDate;
      currentDate.setDate(currentDate.getDate() + 1)
    ) {
      const week = getNthWeekdayOfMonth(currentDate);
      if (week === 5) {
        currentDate.setDate(currentDate.getDate() + 1); // Skip week 5 (if needed)
        continue;
      }
      const day = currentDate.getDay(); // Get the day of the week (0 to 6)

      // Get the relevant month schedules for the current day of the booking
      const schedulesForDay = booking.monthSchedules.filter(
        (ms: any) =>
          ms.weekOfMonth === week && ms.dayOfWeek === day && !ms.skip,
      );

      if (schedulesForDay.length === 0) continue; // Skip if no schedules exist for that day

      // Check if the booking is already scheduled for this day
      const alreadyScheduled = await this.checkIfBookingScheduled(
        booking.id,
        currentDate,
      );
      if (alreadyScheduled) continue; // Skip if already scheduled

      // Loop through the available schedules for this day and create them
      for (const ms of schedulesForDay) {
        const [hours, minutes] = ms.time.split(':').map(Number);
        const startDateTime = new Date(currentDate);
        startDateTime.setHours(hours, minutes, 0); // Set the start time

        // Calculate duration based on area size and service duration
        const durationMins = getDurationFromAreaSize(
          booking.areaSize,
          booking.service.durationMinutes,
        );
        const endDateTime = new Date(
          startDateTime.getTime() + durationMins * 60 * 1000,
        );

        // Find available staff for this time range
        const availableStaff = await this.findAvailableStaffSlot(
          ms.weekOfMonth,
          ms.dayOfWeek,
          startDateTime,
          endDateTime,
        );

        // Save the schedule for the available staff
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

  // Helper functions (for context):

  async checkIfBookingScheduled(bookingId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

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
  // private async findAvailableStaff(
  //   start: Date,
  //   end: Date,
  // ): Promise<User | null> {
  //   const staffList = await this.prisma.user.findMany({
  //     where: {
  //       role: {
  //         name: 'staff', // ✅ FIXED: Assuming roles are related via `role`
  //       },
  //     },
  //   });

  //   for (const staff of staffList) {
  //     const hasConflict = await this.prisma.schedule.findFirst({
  //       where: {
  //         staffId: staff.id,
  //         startTime: { lt: end },
  //         endTime: { gt: start },
  //       },
  //     });

  //     if (!hasConflict) return staff;
  //   }

  //   return null;
  // }

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
    const week = getWeekOfMonth(currentDate);
    if (week === 5) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
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
    weekOfMonth: number,
    dayOfWeek: number,
    startTime: Date,
    endTime: Date,
  ) {
    const unavailableStaffSlots = await this.prisma.staffAvailability.findMany({
      where: {
        date: new Date(startTime),
        dayOfWeek,
        weekOfMonth,
        startTime,
        endTime,
      },
    });

    const unavailableStaffIds = unavailableStaffSlots.map((us) => us.staffId);

    const availableStaffs = await this.prisma.user.findMany({
      where: {
        id: {
          notIn: unavailableStaffIds.length
            ? unavailableStaffIds
            : ['notADummyStaff'], // fallback if empty
        },
        role: { name: 'staff' },
      },
    });

    if (!availableStaffs.length) return null;

    // Pick a random staff
    const randomIndex = Math.floor(Math.random() * availableStaffs.length);
    return availableStaffs[randomIndex];
  }
}

export function getWeekOfMonth(date: Date): number {
  const adjustedDate =
    date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  return Math.ceil(adjustedDate / 7);
}

export function getNthWeekdayOfMonth(date: Date): number {
  const dayOfWeek = date.getDay(); // 0 (Sun) to 6 (Sat)
  let count = 0;

  for (let d = 1; d <= date.getDate(); d++) {
    const current = new Date(date.getFullYear(), date.getMonth(), d);
    if (current.getDay() === dayOfWeek) {
      count++;
    }
  }

  return count;
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

export function get30MinIntervals(
  startTime: Date,
  durationMins: number,
): string[] {
  const slots: string[] = [];
  let time = new Date(startTime);
  for (let i = 0; i < durationMins; i += 30) {
    slots.push(formatTime(time));
    time.setMinutes(time.getMinutes() + 30);
  }
  return slots;
}
