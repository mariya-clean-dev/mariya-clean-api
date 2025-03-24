import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('business-overview')
  getBusinessOverview(
    @Query('startDate') startDate: Date,
    @Query('endDate') endDate: Date,
  ) {
    return this.analyticsService.getBusinessOverview(startDate, endDate);
  }

  @Get('staff-performance')
  getStaffPerformance(
    @Query('staffId') staffId?: string,
    @Query('month') month?: Date,
  ) {
    return this.analyticsService.getStaffPerformance(staffId, month);
  }

  @Post('update-staff-metrics')
  updateStaffPerformanceMetrics() {
    return this.analyticsService.updateStaffPerformanceMetrics();
  }

  @Get('customer-metrics')
  getCustomerMetrics(
    @Query('startDate') startDate: Date,
    @Query('endDate') endDate: Date,
  ) {
    return this.analyticsService.getCustomerMetrics(startDate, endDate);
  }

  @Get('service-metrics')
  getServiceMetrics(
    @Query('startDate') startDate: Date,
    @Query('endDate') endDate: Date,
  ) {
    return this.analyticsService.getServiceMetrics(startDate, endDate);
  }
}
