-- DropForeignKey
ALTER TABLE `schedules` DROP FOREIGN KEY `schedules_staff_id_fkey`;

-- DropIndex
DROP INDEX `schedules_staff_id_fkey` ON `schedules`;

-- AlterTable
ALTER TABLE `schedules` MODIFY `staff_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `schedules` ADD CONSTRAINT `schedules_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
