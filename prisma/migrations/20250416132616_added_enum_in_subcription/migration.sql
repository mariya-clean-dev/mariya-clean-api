-- AlterTable
ALTER TABLE `subscriptions` MODIFY `status` ENUM('active', 'paused', 'canceled', 'pending') NOT NULL;
