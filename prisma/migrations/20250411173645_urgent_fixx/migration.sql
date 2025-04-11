/*
  Warnings:

  - Added the required column `service_id` to the `schedules` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `schedules` ADD COLUMN `service_id` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `schedules` ADD CONSTRAINT `schedules_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
