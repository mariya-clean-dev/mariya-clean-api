/*
  Warnings:

  - You are about to drop the column `maxBookingsPerSlot` on the `zones` table. All the data in the column will be lost.
  - You are about to drop the column `slotMultiplier` on the `zones` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `users` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `zones` DROP COLUMN `maxBookingsPerSlot`,
    DROP COLUMN `slotMultiplier`;
