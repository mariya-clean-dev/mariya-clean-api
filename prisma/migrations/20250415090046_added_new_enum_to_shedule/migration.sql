-- AlterTable
ALTER TABLE `schedules` MODIFY `status` ENUM('scheduled', 'in_progress', 'completed', 'missed', 'canceled', 'refunded') NOT NULL;
