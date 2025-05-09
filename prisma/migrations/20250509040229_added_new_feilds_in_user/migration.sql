-- AlterTable
ALTER TABLE `users` ADD COLUMN `priority` INTEGER NULL,
    ADD COLUMN `stripe_payment_id` VARCHAR(191) NULL;
