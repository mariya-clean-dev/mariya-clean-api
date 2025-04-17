import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  BadRequestException,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateScheduleDto, UpdateStatusDto } from './dto/update-scheduler.dto';
import { CreateScheduleDto } from './dto/create-scheduler.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { ResponseService } from 'src/response/response.service';
import { RescheduleDto } from './dto/reschedule.dto';

@Controller('scheduler')
@UseGuards(JwtAuthGuard)
export class SchedulerController {
  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly resposneService: ResponseService,
  ) {}

  @Post('schedules')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async createSchedule(@Body() createScheduleDto: CreateScheduleDto) {
    const schedule =
      await this.schedulerService.createSchedule(createScheduleDto);
    return this.resposneService.successResponse(
      'Schedule created successfully',
      schedule,
    );
  }

  @Post('auto-schedules')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async autoSchedule(
    @Query('start') startDate: Date,
    @Query('end') endDate: Date,
  ) {
    const schedule = await this.schedulerService.generateSchedulesForDate(
      startDate,
      endDate,
    );
    return this.resposneService.successResponse(
      'Auto Schedule created successfully',
      schedule,
    );
  }

  @Get('available-staff')
  async getAvailableStaffs(
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    const startTime = new Date(start);
    const endTime = new Date(end);
    const data = await this.schedulerService.getAvailableStaffs(
      startTime,
      endTime,
    );
    return this.resposneService.successResponse('Available staffs', data);
  }

  @Get('schedules')
  @Roles('admin', 'staff')
  async getSchedules(
    @Request() req: any,
    @Query('staffId') staffId?: string,
    @Query('bookingId') bookingId?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: Date,
    @Query('endDate') endDate?: Date,
  ) {
    const user = req.user;
    if (user.role == 'staff') {
      staffId = user.id;
    }
    const schedules = await this.schedulerService.findAll(
      page,
      limit,
      staffId,
      bookingId,
      startDate,
      endDate,
      status,
    );
    return this.resposneService.successResponse(
      'Schedules retrieved successfully',
      schedules,
    );
  }

  @Get('month-schedules')
  @Public()
  async getMonthSchedules(
    @Query('startDate') startDate?: Date,
    @Query('endDate') endDate?: Date,
  ) {
    const monthSchedule = await this.schedulerService.findMonthSchedules(
      startDate,
      endDate,
    );
    return this.resposneService.successResponse(
      'Month schedule list',
      monthSchedule,
    );
  }

  @Get('time-slots')
  @Public()
  async getTimeSlots(
    @Query('weekOfMonth') weekOfMonth: number,
    @Query('dayOfWeek') dayOfWeek: number,
  ) {
    if (!weekOfMonth) {
      throw new BadRequestException('params required: weekOfMonth, dayOfWeek');
    }
    const timeSlots = await this.schedulerService.getTimeSlots(
      weekOfMonth,
      dayOfWeek,
    );
    return this.resposneService.successResponse('Time slots list', timeSlots);
  }

  @Get('schedules/:id')
  async getSchedule(@Param('id') id: string) {
    const schedule = await this.schedulerService.findOne(id);
    return this.resposneService.successResponse(
      'Schedule retrieved successfully',
      schedule,
    );
  }

  @Patch('schedules/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'staff')
  async updateSchedule(
    @Param('id') id: string,
    @Body() updateScheduleDto: UpdateScheduleDto,
  ) {
    const updated = await this.schedulerService.update(id, updateScheduleDto);
    return this.resposneService.successResponse(
      'Schedule updated successfully',
      updated,
    );
  }

  @Patch('schedules/:id/change-status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'staff')
  async updateScheduleStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
  ) {
    const userRole = req.user.role;
    const schedule = await this.schedulerService.findOne(id);
    if (userRole == 'staff' && schedule.staff.id !== req.user.id) {
      throw new ForbiddenException(
        'You are not authorized to update this schedule',
      );
    }
    const updated = await this.schedulerService.updateSheduleStatus(
      id,
      updateStatusDto.status,
    );
    return this.resposneService.successResponse(
      'Schedule updated successfully',
      updated,
    );
  }

  // @Patch('reschedule/:id')
  // async reschedule(
  //   @Param('id') scheduleId: string,
  //   @Body() rescheduleDto: RescheduleDto,
  // ) {
  //   return this.schedulerService.rescheduleAndAssignStaff(
  //     scheduleId,
  //     rescheduleDto,
  //   );
  // }

  @Delete('schedules/:id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async removeSchedule(@Param('id') id: string) {
    const removed = await this.schedulerService.remove(id);
    return this.resposneService.successResponse(
      'Schedule removed successfully',
      removed,
    );
  }
}
