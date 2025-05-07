/*
  Warnings:

  - The values [instant,subscription] on the enum `bookings_type` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `recurring_type` on the `subscriptions` table. All the data in the column will be lost.
  - Added the required column `recurring_type_id` to the `subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `paymentMethod` ENUM('online', 'offline', 'subscription') NOT NULL DEFAULT 'online',
    ADD COLUMN `recurring_type_id` VARCHAR(191) NULL,
    MODIFY `type` ENUM('one_time', 'recurring') NOT NULL;

-- AlterTable
ALTER TABLE `month_schedules` MODIFY `week_of_month` INTEGER NULL;

-- AlterTable
ALTER TABLE `subscriptions` DROP COLUMN `recurring_type`,
    ADD COLUMN `recurring_type_id` ENUM('daily', 'weekly', 'bi_weekly', 'monthly') NOT NULL;

-- CreateTable
CREATE TABLE `recurring_type` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `day_frequency` INTEGER NOT NULL,
    `available_discount` DECIMAL(3, 1) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `recurring_type_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_recurring_type_id_fkey` FOREIGN KEY (`recurring_type_id`) REFERENCES `recurring_type`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
