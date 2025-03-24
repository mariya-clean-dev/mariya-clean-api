-- AlterTable
ALTER TABLE `services` ADD COLUMN `stripe_price_id` VARCHAR(191) NULL,
    ADD COLUMN `stripe_product_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `stripe_customer_id` VARCHAR(191) NULL;
