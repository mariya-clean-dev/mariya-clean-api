import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-scheduler.dto';
import { UpdateScheduleDto } from './dto/update-scheduler.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { CreateMonthScheduleDto } from './dto/create-month-schedule.dto';
import * as dayjs from 'dayjs';
import * as weekday from 'dayjs/plugin/weekday';
import * as isoWeek from 'dayjs/plugin/isoWeek';
import * as advancedFormat from 'dayjs/plugin/advancedFormat';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduleStatus, User } from '@prisma/client';
import { RescheduleDto } from './dto/reschedule.dto';
import { Booking } from 'src/bookings/entities/booking.entity';
dayjs.extend(weekday);
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);

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
        status: ScheduleStatus.scheduled,
        startTime,
        endTime,
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

  async rescheduleAndAssignStaff(monthScheduleId: string, dto: RescheduleDto) {
    const { newScheduleDate } = dto;

    // Ensure date is at least 3 days ahead
    const now = new Date();
    const daysDiff =
      (newScheduleDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff < 3)
      throw new Error('Schedule date must be at least 3 days ahead.');

    // Mark month schedule as skipped
    const monthSchedule = await this.prisma.monthSchedule.update({
      where: { id: monthScheduleId },
      data: { skip: true },
    });

    // Find available staff
    const availableStaff = await this.findAvailableStaff(newScheduleDate);
    if (!availableStaff) throw new Error('No available staff found.');

    // Create new schedule
    const endTime = new Date(newScheduleDate.getTime() + 60 * 60 * 1000); // assume 1hr

    const booking = await this.prisma.booking.findUnique({
      where: { id: monthSchedule.bookingId },
      include: { service: true },
    });
    const schedule = await this.prisma.schedule.create({
      data: {
        staff: { connect: { id: availableStaff.id } },
        booking: { connect: { id: monthSchedule.bookingId } },
        service: { connect: { id: booking.service.id } }, // ✅ FIXED HERE
        startTime: newScheduleDate,
        endTime,
        status: 'scheduled',
      },
    });

    return { message: 'Staff assigned and rescheduled successfully', schedule };
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
      where.startTime = {};
      if (startDate) {
        where.startTime.gte = startDate;
      }
      if (endDate) {
        where.startTime.lte = endDate;
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

  async getTimeSlots(weekOfMonth: number, dayOfWeek: number) {
    const bookedSlots = await this.prisma.monthSchedule.findMany({
      where: {
        weekOfMonth,
        dayOfWeek,
      },
      select: {
        time: true,
      },
    });

    const bookedTimes = bookedSlots.map((slot) => slot.time); // e.g., ["09:00", "10:30"]

    const startHour = 9;
    const endHour = 18;
    const interval = 60;

    const slots: { time: string; isAvailable: boolean }[] = [];

    let current = dayjs().hour(startHour).minute(0).second(0);

    while (
      current.hour() < endHour ||
      (current.hour() === endHour && current.minute() === 0)
    ) {
      const timeStr = current.format('HH:mm');
      const isAvailable = !bookedTimes.includes(timeStr);

      slots.push({ time: timeStr, isAvailable });
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
      throw new NotFoundException(`Schedule with ID ${id} not found`);
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

    for (let i = 1; i <= 3; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + i);

      await this.generateSchedulesForDate(targetDate);
    }

    this.logger.log('Auto-Scheduler completed.');
  }

  private async generateSchedulesForDate(date: Date): Promise<void> {
    const dayOfWeek = date.getDay(); // 0-6
    const weekNumber = this.getWeekNumberInMonth(date);

    const monthSchedules = await this.prisma.monthSchedule.findMany({
      where: {
        dayOfWeek,
        weekOfMonth: weekNumber, // ✅ FIXED: Changed from weekNumberInMonth
        skip: false,
      },
      include: {
        booking: {
          include: {
            service: true,
          },
        }, // ✅ to access serviceId if needed via booking
      },
    });

    for (const ms of monthSchedules) {
      const startTime = this.mergeDateTime(date, ms.time);
      const duration = ms.booking?.service?.durationMinutes ?? 60; // fallback to 60 mins
      const endTime = new Date(startTime.getTime() + duration * 60000);

      const existingSchedule = await this.prisma.schedule.findFirst({
        where: {
          bookingId: ms.bookingId,
          startTime: {
            gte: new Date(date.setHours(0, 0, 0, 0)),
            lt: new Date(date.setHours(23, 59, 59, 999)),
          },
        },
      });

      if (existingSchedule) continue;

      const availableStaff = await this.findAvailableStaff(startTime);
      if (!availableStaff) {
        this.logger.warn(
          `No available staff for bookingId ${ms.bookingId} on ${date.toDateString()}`,
        );
        continue;
      }

      await this.prisma.schedule.create({
        data: {
          bookingId: ms.bookingId,
          serviceId: ms.booking.serviceId, // ✅ from joined booking
          staffId: availableStaff.id,
          startTime,
          endTime,
          status: 'scheduled', // ✅ FIXED ENUM: use lowercase
        },
      });

      this.logger.log(
        `Scheduled booking ${ms.bookingId} with staff ${availableStaff.id} on ${startTime}`,
      );
    }
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

  private mergeDateTime(date: Date, timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  private getWeekNumberInMonth(date: Date): number {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfMonth = date.getDate();
    const weekIndex = Math.floor((dayOfMonth + first.getDay() - 1) / 7);
    return weekIndex + 1;
  }
}
