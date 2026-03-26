-- AlterTable
ALTER TABLE `month_schedules` ADD COLUMN `week_number_in_cycle` INTEGER NULL;

-- AlterTable
ALTER TABLE `recurring_type` ADD COLUMN `cycle_weeks` INTEGER NULL,
    ADD COLUMN `week_pattern` VARCHAR(10) NULL;

-- AlterTable
ALTER TABLE `subscriptions` MODIFY `recurring_type_id` ENUM('daily', 'weekly', 'bi_weekly', 'four_weekly', 'monthly') NOT NULL;
