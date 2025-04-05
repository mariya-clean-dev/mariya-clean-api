/*
  Warnings:

  - You are about to drop the column `monthly_slots` on the `services` table. All the data in the column will be lost.
  - You are about to drop the `base_plans` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `price_chart` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `service_categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `service_category_mapping` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `base_price` to the `services` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bathroom_rate` to the `services` table without a default value. This is not possible if the table is not empty.
  - Added the required column `room_rate` to the `services` table without a default value. This is not possible if the table is not empty.
  - Added the required column `square_foot_price` to the `services` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `base_plans` DROP FOREIGN KEY `base_plans_region_id_fkey`;

-- DropForeignKey
ALTER TABLE `base_plans` DROP FOREIGN KEY `base_plans_service_id_fkey`;

-- DropForeignKey
ALTER TABLE `price_chart` DROP FOREIGN KEY `price_chart_service_id_fkey`;

-- DropForeignKey
ALTER TABLE `service_category_mapping` DROP FOREIGN KEY `service_category_mapping_category_id_fkey`;

-- DropForeignKey
ALTER TABLE `service_category_mapping` DROP FOREIGN KEY `service_category_mapping_service_id_fkey`;

-- AlterTable
ALTER TABLE `services` DROP COLUMN `monthly_slots`,
    ADD COLUMN `base_price` DECIMAL(10, 2) NOT NULL,
    ADD COLUMN `bathroom_rate` DECIMAL(10, 2) NOT NULL,
    ADD COLUMN `room_rate` DECIMAL(10, 2) NOT NULL,
    ADD COLUMN `square_foot_price` DECIMAL(10, 2) NOT NULL;

-- DropTable
DROP TABLE `base_plans`;

-- DropTable
DROP TABLE `price_chart`;

-- DropTable
DROP TABLE `service_categories`;

-- DropTable
DROP TABLE `service_category_mapping`;
