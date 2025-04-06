/*
  Warnings:

  - You are about to drop the column `modification_deadline` on the `bookings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `bookings` DROP COLUMN `modification_deadline`;

-- CreateTable
CREATE TABLE `month_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `booking_id` VARCHAR(191) NOT NULL,
    `week_of_month` INTEGER NOT NULL,
    `day_of_week` INTEGER NOT NULL,
    `time` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `month_schedules` ADD CONSTRAINT `month_schedules_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
