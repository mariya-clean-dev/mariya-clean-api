import { ApiProperty } from '@nestjs/swagger';

export class NextUpcomingScheduleResponseDto {
  @ApiProperty({ description: 'Booking ID' })
  bookingId: string;

  @ApiProperty({ description: 'Service name' })
  serviceName: string;

  @ApiProperty({ description: 'Service ID' })
  serviceId: string;

  @ApiProperty({ description: 'Booking status' })
  bookingStatus: string;

  @ApiProperty({ description: 'Booking type (one_time or recurring)' })
  bookingType: string;

  @ApiProperty({ description: 'Booking price' })
  price: number;

  @ApiProperty({ description: 'Address details', required: false })
  address?: {
    line_1: string;
    line_2?: string;
    city: string;
    state?: string;
    zip: string;
  };

  @ApiProperty({ description: 'Assigned staff details', required: false })
  assignedStaff?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };

  @ApiProperty({ description: 'Next upcoming schedule details', required: false })
  nextSchedule?: {
    scheduleId: string;
    startTime: Date;
    endTime: Date;
    status: string;
    staffId?: string;
  };
}
