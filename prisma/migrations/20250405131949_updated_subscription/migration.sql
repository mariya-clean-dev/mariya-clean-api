/*
  Warnings:

  - You are about to drop the column `city` on the `booking_addresses` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `booking_addresses` table. All the data in the column will be lost.
  - You are about to drop the column `street` on the `booking_addresses` table. All the data in the column will be lost.
  - You are about to drop the column `zip` on the `booking_addresses` table. All the data in the column will be lost.
  - Added the required column `address_id` to the `booking_addresses` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `booking_addresses` DROP COLUMN `city`,
    DROP COLUMN `state`,
    DROP COLUMN `street`,
    DROP COLUMN `zip`,
    ADD COLUMN `address_id` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `subscription_type_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `subscription_type` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `recurring_frequency` INTEGER NOT NULL,
    `available_discount` DECIMAL(3, 1) NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_subscription_type_id_fkey` FOREIGN KEY (`subscription_type_id`) REFERENCES `subscription_type`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_addresses` ADD CONSTRAINT `booking_addresses_address_id_fkey` FOREIGN KEY (`address_id`) REFERENCES `addresses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
