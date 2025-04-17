/*
  Warnings:

  - Added the required column `week_of_month` to the `staff_availability` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `staff_availability` ADD COLUMN `week_of_month` INTEGER NOT NULL;
