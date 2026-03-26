export class CreateMonthScheduleDto {
  bookingId: string;
  weekOfMonth?: number;
  dayOfWeek: number;
  time: string; // Format: 'HH:mm' or similar
  /// For bi_weekly/four_weekly: 1-based position in the cycle (1..cycleWeeks)
  weekNumberInCycle?: number;
}
