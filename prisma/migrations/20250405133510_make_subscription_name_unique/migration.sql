/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `subscription_type` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `subscription_type` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `subscription_type` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `subscription_type_name_key` ON `subscription_type`(`name`);
