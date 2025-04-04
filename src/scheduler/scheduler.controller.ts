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
} from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateScheduleDto } from './dto/update-scheduler.dto';
import { CreateScheduleDto } from './dto/create-scheduler.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';

@Controller('scheduler')
@UseGuards(JwtAuthGuard)
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Post('schedules')
  @UseGuards(RolesGuard)
  @Roles('admin')
  createSchedule(@Body() createScheduleDto: CreateScheduleDto) {
    return this.schedulerService.createSchedule(createScheduleDto);
  }

  @Get('schedules')
  getSchedules(
    @Query('staffId') staffId?: string,
    @Query('bookingId') bookingId?: string,
    @Query('startDate') startDate?: Date,
    @Query('endDate') endDate?: Date,
  ) {
    return this.schedulerService.findAll(
      staffId,
      bookingId,
      startDate,
      endDate,
    );
  }

  @Get('schedules/:id')
  getSchedule(@Param('id') id: string) {
    return this.schedulerService.findOne(id);
  }

  @Patch('schedules/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'staff')
  updateSchedule(
    @Param('id') id: string,
    @Body() updateScheduleDto: UpdateScheduleDto,
  ) {
    return this.schedulerService.update(id, updateScheduleDto);
  }

  @Delete('schedules/:id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  removeSchedule(@Param('id') id: string) {
    return this.schedulerService.remove(id);
  }

  @Get('staff/:staffId/availability')
  getStaffAvailability(@Param('staffId') staffId: string) {
    return this.schedulerService.getStaffAvailability(staffId);
  }

  @Post('staff/availability')
  @UseGuards(RolesGuard)
  @Roles('admin')
  createStaffAvailability(
    @Body() createAvailabilityDto: CreateAvailabilityDto,
  ) {
    return this.schedulerService.createStaffAvailability(createAvailabilityDto);
  }

  @Patch('staff/availability/:id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updateStaffAvailability(
    @Param('id') id: string,
    @Body() updateAvailabilityDto: UpdateAvailabilityDto,
  ) {
    return this.schedulerService.updateStaffAvailability(
      id,
      updateAvailabilityDto,
    );
  }

  @Delete('staff/availability/:id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  removeStaffAvailability(@Param('id') id: string) {
    return this.schedulerService.removeStaffAvailability(id);
  }

  @Get('available-staff')
  getAvailableStaff(
    @Query('date') date: Date,
    @Query('serviceId') serviceId: string,
  ) {
    return this.schedulerService.getAvailableStaff(date, serviceId);
  }
}
