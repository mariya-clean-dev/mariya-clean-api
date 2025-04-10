-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `material_provided` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `property_type` VARCHAR(191) NULL;
