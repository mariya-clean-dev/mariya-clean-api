-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `no_of_bathrooms` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `no_of_rooms` INTEGER NOT NULL DEFAULT 0;
