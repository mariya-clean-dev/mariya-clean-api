/*
  Warnings:

  - A unique constraint covering the columns `[staff_id,date,start_time,end_time]` on the table `staff_availability` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `staff_availability_staff_id_date_start_time_end_time_key` ON `staff_availability`(`staff_id`, `date`, `start_time`, `end_time`);
