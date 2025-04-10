import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
dayjs.extend(weekday);
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);

@Injectable()
export class SchedulerService {
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
        staffId: createScheduleDto.staffId,
        bookingId: createScheduleDto.bookingId,
        startTime,
        endTime,
      },
    });
  }

  async findAll(
    staffId?: string,
    bookingId?: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    // Build where clause
    const where: any = {};

    if (staffId) {
      where.staffId = staffId;
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

    return this.prisma.schedule.findMany({
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
    });
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

    const bookedTimes = bookedSlots.map(slot => slot.time); // e.g., ["09:00", "10:30"]

    const startHour = 9;
    const endHour = 19;
    const interval = 30;

    const slots: { time: string; isAvailable: boolean }[] = [];

    let current = dayjs().hour(startHour).minute(0).second(0);

    while (current.hour() < endHour || (current.hour() === endHour && current.minute() === 0)) {
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

  async getStaffAvailability(staffId: string) {
    // Check if staff exists
    const staff = await this.prisma.user.findFirst({
      where: {
        id: staffId,
        role: {
          name: 'staff',
        },
      },
    });

    if (!staff) {
      throw new NotFoundException(`Staff with ID ${staffId} not found`);
    }

    // Get staff availability
    return this.prisma.staffAvailability.findMany({
      where: { staffId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createStaffAvailability(createAvailabilityDto: CreateAvailabilityDto) {
    // Check if staff exists
    const staff = await this.prisma.user.findFirst({
      where: {
        id: createAvailabilityDto.staffId,
        role: {
          name: 'staff',
        },
      },
    });

    if (!staff) {
      throw new NotFoundException(
        `Staff with ID ${createAvailabilityDto.staffId} not found`,
      );
    }

    // Validate day of week (0-6, Sunday to Saturday)
    if (
      createAvailabilityDto.dayOfWeek < 0 ||
      createAvailabilityDto.dayOfWeek > 6
    ) {
      throw new BadRequestException(
        'Day of week must be between 0 (Sunday) and 6 (Saturday)',
      );
    }

    // Parse times
    const startTime = new Date(
      `1970-01-01T${createAvailabilityDto.startTime}:00Z`,
    );
    const endTime = new Date(`1970-01-01T${createAvailabilityDto.endTime}:00Z`);

    // Validate time range
    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    // Check for overlapping availability slots
    const overlappingSlot = await this.prisma.staffAvailability.findFirst({
      where: {
        staffId: createAvailabilityDto.staffId,
        dayOfWeek: createAvailabilityDto.dayOfWeek,
        OR: [
          // New slot starts during existing slot
          {
            startTime: { lte: startTime },
            endTime: { gt: startTime },
          },
          // New slot ends during existing slot
          {
            startTime: { lt: endTime },
            endTime: { gte: endTime },
          },
          // New slot entirely contains existing slot
          {
            startTime: { gte: startTime },
            endTime: { lte: endTime },
          },
        ],
      },
    });

    if (overlappingSlot) {
      throw new BadRequestException(
        'Availability slot overlaps with an existing slot',
      );
    }

    // Create availability slot
    return this.prisma.staffAvailability.create({
      data: {
        staffId: createAvailabilityDto.staffId,
        dayOfWeek: createAvailabilityDto.dayOfWeek,
        startTime,
        endTime,
        isAvailable: createAvailabilityDto.isAvailable ?? true,
      },
    });
  }

  async updateStaffAvailability(id: string, updateAvailabilityDto: any) {
    // Check if availability slot exists
    const availabilitySlot = await this.prisma.staffAvailability.findUnique({
      where: { id },
    });

    if (!availabilitySlot) {
      throw new NotFoundException(`Availability slot with ID ${id} not found`);
    }

    // Prepare update data
    const updateData: any = {};

    // Handle day of week update
    if (updateAvailabilityDto.dayOfWeek !== undefined) {
      // Validate day of week
      if (
        updateAvailabilityDto.dayOfWeek < 0 ||
        updateAvailabilityDto.dayOfWeek > 6
      ) {
        throw new BadRequestException(
          'Day of week must be between 0 (Sunday) and 6 (Saturday)',
        );
      }
      updateData.dayOfWeek = updateAvailabilityDto.dayOfWeek;
    }

    // Handle start time update
    if (updateAvailabilityDto.startTime) {
      updateData.startTime = new Date(
        `1970-01-01T${updateAvailabilityDto.startTime}:00Z`,
      );
    }

    // Handle end time update
    if (updateAvailabilityDto.endTime) {
      updateData.endTime = new Date(
        `1970-01-01T${updateAvailabilityDto.endTime}:00Z`,
      );
    }

    // Handle is available update
    if (updateAvailabilityDto.isAvailable !== undefined) {
      updateData.isAvailable = updateAvailabilityDto.isAvailable;
    }

    // Validate time range if both times are provided
    if (updateData.startTime && updateData.endTime) {
      if (updateData.endTime <= updateData.startTime) {
        throw new BadRequestException('End time must be after start time');
      }
    } else if (updateData.startTime) {
      // If only start time is provided, validate with existing end time
      if (updateData.startTime >= availabilitySlot.endTime) {
        throw new BadRequestException('Start time must be before end time');
      }
    } else if (updateData.endTime) {
      // If only end time is provided, validate with existing start time
      if (availabilitySlot.startTime >= updateData.endTime) {
        throw new BadRequestException('End time must be after start time');
      }
    }

    // Check for overlapping availability slots if time or day changes
    if (
      updateData.dayOfWeek !== undefined ||
      updateData.startTime ||
      updateData.endTime
    ) {
      const dayOfWeek = updateData.dayOfWeek ?? availabilitySlot.dayOfWeek;
      const startTime = updateData.startTime || availabilitySlot.startTime;
      const endTime = updateData.endTime || availabilitySlot.endTime;

      const overlappingSlot = await this.prisma.staffAvailability.findFirst({
        where: {
          id: { not: id }, // Exclude current slot
          staffId: availabilitySlot.staffId,
          dayOfWeek,
          OR: [
            // Updated slot starts during existing slot
            {
              startTime: { lte: startTime },
              endTime: { gt: startTime },
            },
            // Updated slot ends during existing slot
            {
              startTime: { lt: endTime },
              endTime: { gte: endTime },
            },
            // Updated slot entirely contains existing slot
            {
              startTime: { gte: startTime },
              endTime: { lte: endTime },
            },
          ],
        },
      });

      if (overlappingSlot) {
        throw new BadRequestException(
          'Availability slot overlaps with an existing slot',
        );
      }
    }

    // Update availability slot
    return this.prisma.staffAvailability.update({
      where: { id },
      data: updateData,
    });
  }

  async removeStaffAvailability(id: string) {
    // Check if availability slot exists
    const availabilitySlot = await this.prisma.staffAvailability.findUnique({
      where: { id },
    });

    if (!availabilitySlot) {
      throw new NotFoundException(`Availability slot with ID ${id} not found`);
    }

    // Delete availability slot
    await this.prisma.staffAvailability.delete({
      where: { id },
    });

    return { message: 'Availability slot deleted successfully' };
  }

  async getAvailableStaff(date: Date, serviceId: string) {
    // Get the service to determine duration
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service) {
      throw new NotFoundException(`Service with ID ${serviceId} not found`);
    }

    // Calculate end time based on service duration
    const startTime = new Date(date);
    const endTime = new Date(
      startTime.getTime() + service.durationMinutes * 60000,
    );

    // Get the day of the week (0-6, Sunday to Saturday)
    const dayOfWeek = startTime.getDay();

    // Get all staff with available time slots for this day and time range
    const availableStaff = await this.prisma.user.findMany({
      where: {
        role: {
          name: 'staff',
        },
        status: 'active',
        staffAvailability: {
          some: {
            dayOfWeek,
            isAvailable: true,
            startTime: {
              lte: new Date(
                `1970-01-01T${startTime.getHours()}:${startTime.getMinutes()}:00Z`,
              ),
            },
            endTime: {
              gte: new Date(
                `1970-01-01T${endTime.getHours()}:${endTime.getMinutes()}:00Z`,
              ),
            },
          },
        },
        // Exclude staff who already have schedules during this time
        NOT: {
          schedules: {
            some: {
              OR: [
                // Existing schedule starts during requested time
                {
                  startTime: { gte: startTime, lt: endTime },
                },
                // Existing schedule ends during requested time
                {
                  endTime: { gt: startTime, lte: endTime },
                },
                // Existing schedule completely contains requested time
                {
                  startTime: { lte: startTime },
                  endTime: { gte: endTime },
                },
              ],
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });

    return availableStaff;
  }
}
