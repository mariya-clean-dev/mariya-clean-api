/*
  Warnings:

  - Added the required column `status` to the `schedules` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `schedules` ADD COLUMN `status` ENUM('scheduled', 'in_progress', 'completed', 'missed', 'canceled') NOT NULL;
