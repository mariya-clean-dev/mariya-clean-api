export class CreateMonthScheduleDto {
  bookingId: string;
  weekOfMonth: number;
  dayOfWeek: number;
  time: string; // Format: 'HH:mm' or similar
}
