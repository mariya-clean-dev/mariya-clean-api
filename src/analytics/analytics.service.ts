// src/analytics/analytics.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookingStatus,
  Prisma,
  PrismaClient,
  TransactionStatus,
} from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBusinessOverview(startDate: Date, endDate: Date) {
    // Get total bookings in the period
    const totalBookings = await this.prisma.booking.count({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Get completed bookings in the period
    const completedBookings = await this.prisma.booking.count({
      where: {
        status: 'completed',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Get total revenue in the period (include only successful payments)
    const transactions = await this.prisma.transaction.findMany({
      where: {
        status: 'successful',
        transactionType: 'payment',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        amount: true,
      },
    });

    const totalRevenue = transactions.reduce(
      (sum, transaction) => sum + Number(transaction.amount),
      0,
    );

    // Get booking counts by status
    const bookingsByStatus = await this.prisma.booking.groupBy({
      by: ['status'],
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: true,
    });

    // Get service popularity
    const bookingsByService = await this.prisma.booking.groupBy({
      by: ['serviceId'],
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: true,
    });

    // Get service details for the names
    const serviceIds = bookingsByService.map((item) => item.serviceId);
    const services = await this.prisma.service.findMany({
      where: {
        id: { in: serviceIds },
      },
      select: {
        id: true,
        name: true,
      },
    });

    // Map service IDs to names
    const serviceIdToName = new Map();
    services.forEach((service) => {
      serviceIdToName.set(service.id, service.name);
    });

    // Format service popularity with names
    const servicePopularity = bookingsByService.map((item) => ({
      serviceId: item.serviceId,
      serviceName: serviceIdToName.get(item.serviceId) || 'Unknown Service',
      count: item._count,
    }));

    return {
      totalBookings,
      completedBookings,
      completionRate:
        totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0,
      totalRevenue,
      bookingsByStatus,
      servicePopularity,
    };
  }

  async getStaffPerformance(staffId?: string, month?: Date) {
    const where: any = {};

    if (staffId) {
      where.staffId = staffId;
    }

    if (month) {
      const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
      const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);
      where.month = {
        gte: startOfMonth,
        lte: endOfMonth,
      };
    }

    // Get staff performance metrics
    const performanceMetrics = await this.prisma.staffPerformance.findMany({
      where,
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // If no specific staff is requested, get top performers
    if (!staffId) {
      // Get top staff by ratings
      const topByRating = [...performanceMetrics]
        .sort((a, b) => Number(b.ratingAverage) - Number(a.ratingAverage))
        .slice(0, 5);

      // Get top staff by completed bookings
      const topByCompletions = [...performanceMetrics]
        .sort((a, b) => b.completedBookings - a.completedBookings)
        .slice(0, 5);

      // Get top staff by on-time percentage
      const topByOnTime = [...performanceMetrics]
        .sort((a, b) => Number(b.onTimePercentage) - Number(a.onTimePercentage))
        .slice(0, 5);

      return {
        allStaff: performanceMetrics,
        topPerformers: {
          byRating: topByRating,
          byCompletions: topByCompletions,
          byOnTime: topByOnTime,
        },
      };
    }

    return performanceMetrics;
  }

  async updateStaffPerformanceMetrics() {
    // This method would typically be called by a scheduled job

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get all staff
    const staffUsers = await this.prisma.user.findMany({
      where: {
        role: {
          name: 'staff',
        },
      },
    });

    // For each staff member, calculate performance metrics
    for (const staff of staffUsers) {
      // Get completed bookings for the month
      const completedBookings = await this.prisma.booking.findMany({
        where: {
          assignedStaffId: staff.id,
          status: 'completed',
          updatedAt: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        include: {
          schedules: true,
          review: true,
        },
      });

      // Skip if no completed bookings
      if (completedBookings.length === 0) {
        continue;
      }

      // Calculate average completion time (in minutes)
      let totalCompletionTime = 0;
      let onTimeCount = 0;

      completedBookings.forEach((booking) => {
        if (booking.schedules.length > 0) {
          const schedule = booking.schedules[0];
          if (schedule.actualStartTime && schedule.actualEndTime) {
            // Calculate actual completion time in minutes
            const completionTime =
              (schedule.actualEndTime.getTime() -
                schedule.actualStartTime.getTime()) /
              60000;
            totalCompletionTime += completionTime;

            // Check if completed on time
            const scheduledEndTime = schedule.endTime;
            if (schedule.actualEndTime <= scheduledEndTime) {
              onTimeCount++;
            }
          }
        }
      });

      const averageCompletionTime = Math.round(
        totalCompletionTime / completedBookings.length,
      );
      const onTimePercentage = (onTimeCount / completedBookings.length) * 100;

      // Calculate average rating
      const bookingsWithReviews = completedBookings.filter(
        (booking) => booking.review,
      );
      let ratingAverage = 0;

      if (bookingsWithReviews.length > 0) {
        const totalRating = bookingsWithReviews.reduce(
          (sum, booking) => sum + Number(booking.review.rating),
          0,
        );
        ratingAverage = totalRating / bookingsWithReviews.length;
      }

      // Check if a record already exists for this staff and month
      const existingRecord = await this.prisma.staffPerformance.findFirst({
        where: {
          staffId: staff.id,
          month: startOfMonth,
        },
      });

      // Update or create staff performance record
      if (existingRecord) {
        await this.prisma.staffPerformance.update({
          where: { id: existingRecord.id },
          data: {
            completedBookings: completedBookings.length,
            averageCompletionTime,
            onTimePercentage,
            ratingAverage,
          },
        });
      } else {
        await this.prisma.staffPerformance.create({
          data: {
            staffId: staff.id,
            month: startOfMonth,
            completedBookings: completedBookings.length,
            averageCompletionTime,
            onTimePercentage,
            ratingAverage,
          },
        });
      }
    }

    return { message: 'Staff performance metrics updated successfully' };
  }

  async getCustomerMetrics(startDate: Date, endDate: Date) {
    // Get new customer signups
    const newCustomers = await this.prisma.user.count({
      where: {
        role: {
          name: 'customer',
        },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Get total customers
    const totalCustomers = await this.prisma.user.count({
      where: {
        role: {
          name: 'customer',
        },
      },
    });

    // Get bookings in the period
    const bookingsInPeriod = await this.prisma.booking.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        userId: true,
      },
    });

    // Count bookings per user
    const userBookingCounts: Record<string, number> = {};
    bookingsInPeriod.forEach((booking) => {
      userBookingCounts[booking.userId] =
        (userBookingCounts[booking.userId] || 0) + 1;
    });

    // Get unique customers with bookings
    const activeCustomers = Object.keys(userBookingCounts).length;

    // Get customers with multiple bookings
    const repeatCustomers = Object.values(userBookingCounts).filter(
      (count) => count > 1,
    ).length;

    // Get top customers by booking count
    const topCustomers = Object.entries(userBookingCounts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get customer details
    const customerIds = topCustomers.map((item) => item.userId);
    const customers = await this.prisma.user.findMany({
      where: {
        id: { in: customerIds },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    // Map customer IDs to info
    const customerIdToInfo: Record<string, any> = {};
    customers.forEach((customer) => {
      customerIdToInfo[customer.id] = {
        name: customer.name,
        email: customer.email,
      };
    });

    // Format top customers
    const formattedTopCustomers = topCustomers.map((item) => ({
      userId: item.userId,
      name: customerIdToInfo[item.userId]?.name || 'Unknown Customer',
      email: customerIdToInfo[item.userId]?.email || 'Unknown Email',
      bookingCount: item.count,
    }));

    return {
      newCustomers,
      totalCustomers,
      activeCustomers,
      repeatCustomers,
      topCustomers: formattedTopCustomers,
    };
  }

  async getServiceMetrics(startDate: Date, endDate: Date) {
    // Get all bookings in the period
    const bookings = await this.prisma.booking.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        serviceId: true,
        price: true,
      },
    });

    // Group bookings by service
    const serviceBookings: Record<
      string,
      { bookingCount: number; revenue: number }
    > = {};
    bookings.forEach((booking) => {
      if (!serviceBookings[booking.serviceId]) {
        serviceBookings[booking.serviceId] = {
          bookingCount: 0,
          revenue: 0,
        };
      }
      serviceBookings[booking.serviceId].bookingCount++;
      serviceBookings[booking.serviceId].revenue += Number(booking.price);
    });

    // Get service details
    const serviceIds = Object.keys(serviceBookings);
    const services = await this.prisma.service.findMany({
      where: {
        id: { in: serviceIds },
      },
      select: {
        id: true,
        name: true,
      },
    });

    // Map service IDs to names
    const serviceIdToName: Record<string, string> = {};
    services.forEach((service) => {
      serviceIdToName[service.id] = service.name;
    });

    // Format service metrics
    const serviceMetrics = Object.entries(serviceBookings).map(
      ([serviceId, metrics]) => ({
        serviceId,
        serviceName: serviceIdToName[serviceId] || 'Unknown Service',
        bookingCount: metrics.bookingCount,
        revenue: metrics.revenue,
      }),
    );

    // Sort by revenue
    serviceMetrics.sort((a, b) => b.revenue - a.revenue);

    return {
      serviceMetrics,
    };
  }

  async getSummary(startDate: Date, endDate: Date) {
    const fromDate = new Date(startDate);
    const toDate = new Date(endDate);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid "startDate" or "endDate"');
    }

    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    const [distinctClients, totalEarningsData, totalStaff] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          customerBookings: {
            some: {
              status: {
                in: ['booked', 'in_progress'],
              },
            },
          },
        },
        include: {
          customerBookings: {
            where: {
              status: 'in_progress',
            },
          },
        },
      }),
      this.prisma.transaction.aggregate({
        where: {
          status: TransactionStatus.successful,
          createdAt: {
            gte: fromDate,
            lte: toDate,
          },
        },
        _sum: {
          amount: true,
        },
      }),
      this.prisma.user.count({
        where: {
          role: {
            is: {
              name: 'staff',
            },
          },
        },
      }),
    ]);

    return {
      totalClients: distinctClients.length,
      totalEarnings: totalEarningsData._sum.amount?.toNumber() || 0,
      totalStaff,
    };
  }

  async getPerformance(startDate: Date, endDate: Date) {
    const fromDate = new Date(startDate);
    const toDate = new Date(endDate);

    const bookings = await this.prisma.booking.findMany({
      where: {
        createdAt: { gte: fromDate, lte: toDate },
      },
      // Adjust this include if you actually have a staff relation or use user info instead
      include: {
        assignedStaff: true, // Replace with actual relation name if exists
      },
    });

    const totalDays = Math.max(
      1,
      Math.ceil(
        (endOfDay(toDate).getTime() - startOfDay(fromDate).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    const avgBookingPerDay = bookings.length / totalDays;
    const avgStaffPerBooking =
      bookings.reduce((acc, b) => acc + (b.assignedStaff ? 1 : 0), 0) /
        bookings.length || 0;

    const canceledBookings = bookings.filter(
      (b) => b.status === 'canceled',
    ).length;

    return {
      avgBookingPerDay: Math.round(avgBookingPerDay),
      avgStaffPerBooking: Math.round(avgStaffPerBooking),
      canceledBookings,
    };
  }

  async getBookingTrend(startDate: Date, endDate: Date) {
    const fromDate = new Date(startDate);
    const toDate = new Date(endDate);

    const bookings = await this.prisma.booking.findMany({
      where: {
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: {
        createdAt: true,
      },
    });

    const monthlyCount = new Map<string, number>();

    for (const booking of bookings) {
      const date = new Date(booking.createdAt);
      const label = date.toLocaleString('default', { month: 'short' }); // "Jan", "Feb", etc.

      monthlyCount.set(label, (monthlyCount.get(label) || 0) + 1);
    }

    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    return months.map((month) => ({
      month,
      value: monthlyCount.get(month) || 0,
    }));
  }

  async getCancellations(startDate: Date, endDate: Date) {
    // const fromDate = new Date(from);
    // const toDate = new Date(to);
    // const canceled = await this.prisma.booking.findMany({
    //   where: {
    //     status: 'canceled',
    //     createdAt: { gte: fromDate, lte: toDate },
    //   },
    //   include: {
    //     user: true,
    //     bookingAddress: true,
    //     location: true,
    //   },
    // });
    // return canceled.map((c) => ({
    //   customerName: c.user?.name || 'Unknown',
    //   date: c.scheduleDate?.toISOString().split('T')[0] || '',
    //   timeSlot: `${c.timeFrom || ''} - ${c.timeTo || ''}`,
    //   location: `${c.location?.city || ''}, ${c.location?.state || ''}, ${c.location?.zip || ''} - ${c.location?.area || ''}`,
    //   status: 'Canceled',
    // }));
  }

  async getBookingHeatmapCalendar(
    year: number,
    month: number,
    staffId?: string,
  ) {
    // Create start and end dates for the specified month
    const startDate = new Date(year, month - 1, 1); // month is 0-indexed in Date constructor
    const endDate = new Date(year, month, 0); // Last day of the month

    // Set time boundaries
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // Build where clause for filtering schedules by their start time
    const whereClause: any = {
      startTime: {
        gte: startDate,
        lte: endDate,
      },
      isSkipped: false, // Only include non-skipped schedules
      status: {
        notIn: ['canceled', 'rescheduled'], // Exclude canceled and rescheduled schedules
      },
    };

    // Add staff filter if provided
    if (staffId) {
      whereClause.staffId = staffId;
    }

    // Get all schedules for the month with staff and booking details
    const schedules = await this.prisma.schedule.findMany({
      where: whereClause,
      select: {
        id: true,
        startTime: true,
        staffId: true,
        status: true,
        bookingId: true,
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
          },
        },
      },
    });

    // Initialize heatmap data for all days of the month
    const daysInMonth = endDate.getDate();
    const heatmapData: { [day: number]: number } = {};

    // Initialize all days with 0 schedules
    for (let day = 1; day <= daysInMonth; day++) {
      heatmapData[day] = 0;
    }

    // Count schedules per day
    schedules.forEach((schedule) => {
      const day = schedule.startTime.getDate();
      heatmapData[day]++;
    });

    // Convert to array format for easier consumption
    const heatmapArray = Object.entries(heatmapData).map(([day, count]) => {
      const dateObj = new Date(Date.UTC(year, month - 1, parseInt(day)));
      return {
        date: dateObj.toISOString(), // always midnight UTC
        bookingCount: count, // This represents scheduled work count, not booking creation count
      };
    });

    // Get staff info if filtering by staff
    let staffInfo = null;
    if (staffId && schedules.length > 0) {
      const staffSchedule = schedules.find((s) => s.staff);
      if (staffSchedule?.staff) {
        staffInfo = {
          id: staffSchedule.staff.id,
          name: staffSchedule.staff.name,
          email: staffSchedule.staff.email,
        };
      }
    }

    // Calculate summary statistics based on schedules
    const totalBookings = schedules.length; // This is actually total scheduled work count
    const statusBreakdown = schedules.reduce(
      (acc, schedule) => {
        // Use schedule status for breakdown
        acc[schedule.status] = (acc[schedule.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Also get booking status breakdown for additional context
    const bookingStatusBreakdown = schedules.reduce(
      (acc, schedule) => {
        const bookingStatus = schedule.booking?.status;
        if (bookingStatus) {
          acc[bookingStatus] = (acc[bookingStatus] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      year,
      month,
      staffId,
      staffInfo,
      totalBookings,
      statusBreakdown, // Schedule status breakdown
      bookingStatusBreakdown, // Booking status breakdown for additional context
      heatmapData: heatmapArray,
      monthName: new Date(year, month - 1, 1).toLocaleString('default', {
        month: 'long',
      }),
      daysInMonth,
    };
  }
}
