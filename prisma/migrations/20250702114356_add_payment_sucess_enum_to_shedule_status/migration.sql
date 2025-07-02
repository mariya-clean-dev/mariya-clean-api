-- AlterTable
ALTER TABLE `schedules` MODIFY `status` ENUM('scheduled', 'in_progress', 'completed', 'missed', 'canceled', 'payment_failed', 'refunded', 'rescheduled', 'payment_success') NOT NULL;
