import { Controller, Get, Post, Query, UseGuards, Request } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ResponseService } from 'src/response/response.service';
import { BookingHeatmapDto } from '../bookings/dto/booking-heatmap.dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly responseService: ResponseService,
  ) {}

  @Get('business-overview')
  async getBusinessOverview(
    @Query('startDate') startDate: Date,
    @Query('endDate') endDate: Date,
  ) {
    const overview = await this.analyticsService.getBusinessOverview(
      startDate,
      endDate,
    );
    return this.responseService.successResponse(
      'Business Overview Report',
      overview,
    );
  }

  @Get('staff-performance')
  async getStaffPerformance(
    @Query('staffId') staffId?: string,
    @Query('month') month?: Date,
  ) {
    const data = await this.analyticsService.getStaffPerformance(
      staffId,
      month,
    );
    return this.responseService.successResponse(
      'Staff Performance Report',
      data,
    );
  }

  @Post('update-staff-metrics')
  async updateStaffPerformanceMetrics() {
    const response =
      await this.analyticsService.updateStaffPerformanceMetrics();
    return this.responseService.successResponse(
      'Staff Performance Metrics Updated',
      response,
    );
  }

  @Get('customer-metrics')
  async getCustomerMetrics(
    @Query('startDate') startDate: Date,
    @Query('endDate') endDate: Date,
  ) {
    const response = await this.analyticsService.getCustomerMetrics(
      startDate,
      endDate,
    );
    return this.responseService.successResponse(
      'Customer Metrics Report',
      response,
    );
  }

  @Get('service-metrics')
  async getServiceMetrics(
    @Query('startDate') startDate: Date,
    @Query('endDate') endDate: Date,
  ) {
    const response = await this.analyticsService.getServiceMetrics(
      startDate,
      endDate,
    );
    return this.responseService.successResponse(
      'Service Metrics Report',
      response,
    );
  }

  @Get('summary')
  async getSummary(
    @Query('startDate') startDate: Date,
    @Query('endDate') endDate: Date,
  ) {
    const summary = await this.analyticsService.getSummary(startDate, endDate);
    return this.responseService.successResponse(
      'Business Summary Report',
      summary,
    );
  }

  @Get('performance')
  async getPerformance(
    @Query('startDate') startDate: Date,
    @Query('endDate') endDate: Date,
  ) {
    const performance = await this.analyticsService.getPerformance(
      startDate,
      endDate,
    );
    return this.responseService.successResponse(
      'Business Performance Report',
      performance,
    );
  }

  @Get('bookings-over-time')
  async getBookingGraph(
    @Query('startDate') startDate: Date,
    @Query('endDate') endDate: Date,
  ) {
    const trend = await this.analyticsService.getBookingTrend(
      startDate,
      endDate,
    );
    return this.responseService.successResponse(
      'Bookings Over Time Report',
      trend,
    );
  }

  @Get('booking-heatmap')
  @Roles('admin', 'staff') // Allow both admin and staff
  async getBookingHeatmapCalendar(
    @Query() query: BookingHeatmapDto,
    @Request() req,
  ) {
    const { year, month, staffId } = query;
    
    // If user is staff, they can only see their own data
    let filterStaffId = staffId;
    if (req.user.role === 'staff') {
      filterStaffId = req.user.id;
    }
    
    const heatmapData = await this.analyticsService.getBookingHeatmapCalendar(
      year,
      month,
      filterStaffId,
    );
    
    return this.responseService.successResponse(
      'Booking Heatmap Calendar Analytics',
      heatmapData,
    );
  }

  // @Get('cancellations')
  // async getCancellations(
  //   @Query('startDate') startDate: Date,
  //   @Query('endDate') endDate: Date,
  // ) {
  //   const cancellations = await this.analyticsService.getCancellations(
  //     startDate,
  //     endDate,
  //   );
  //   return this.responseService.successResponse(
  //     'Cancellation Report',
  //     cancellations,
  //   );
  // }
}
