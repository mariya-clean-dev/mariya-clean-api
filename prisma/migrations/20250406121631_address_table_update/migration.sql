/*
  Warnings:

  - Added the required column `line_1` to the `addresses` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `addresses` ADD COLUMN `landmark` VARCHAR(191) NULL,
    ADD COLUMN `line_1` VARCHAR(191) NOT NULL,
    ADD COLUMN `line_2` VARCHAR(191) NULL,
    MODIFY `street` VARCHAR(191) NULL,
    MODIFY `state` VARCHAR(191) NULL;
