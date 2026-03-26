-- ============================================================
-- Manual migration: four_weekly booking support
-- Run AFTER reviewing, with: npx prisma migrate deploy
-- OR execute directly against your database.
-- ============================================================

-- 1. Add `week_pattern` column to recurring_type
ALTER TABLE `recurring_type`
  ADD COLUMN `week_pattern` VARCHAR(10) NULL COMMENT 'odd|even for bi_weekly; 1|2|3|4 for four_weekly';

-- 2. Add `cycle_weeks` column to recurring_type
ALTER TABLE `recurring_type`
  ADD COLUMN `cycle_weeks` INT NULL COMMENT '2 for bi_weekly, 4 for four_weekly, NULL for others';

-- 3. Add `week_number_in_cycle` column to month_schedules
ALTER TABLE `month_schedules`
  ADD COLUMN `week_number_in_cycle` INT NULL COMMENT '1-based week position within the cycle (for bi_weekly/four_weekly)';

-- ============================================================
-- Seed data: Insert the four_weekly recurring type variants.
-- Each of the 4 week-positions is its own RecurringType row
-- so the admin can manage discounts per week position.
-- ============================================================
INSERT INTO `recurring_type`
  (`id`, `name`, `description`, `day_frequency`, `available_discount`, `week_pattern`, `cycle_weeks`, `created_at`, `updated_at`)
VALUES
  (UUID(), '4-Weekly (Week 1)', 'Repeats every 4 weeks — first occurrence week', 7, 5.0, '1', 4, NOW(), NOW()),
  (UUID(), '4-Weekly (Week 2)', 'Repeats every 4 weeks — second occurrence week', 7, 5.0, '2', 4, NOW(), NOW()),
  (UUID(), '4-Weekly (Week 3)', 'Repeats every 4 weeks — third occurrence week', 7, 5.0, '3', 4, NOW(), NOW()),
  (UUID(), '4-Weekly (Week 4)', 'Repeats every 4 weeks — fourth occurrence week', 7, 5.0, '4', 4, NOW(), NOW());

-- ============================================================
-- Patch existing bi_weekly recurring types (if they don't
-- already have cycleWeeks set). Adjust the WHERE clause to
-- match your actual row names.
-- ============================================================
-- UPDATE `recurring_type` SET `cycle_weeks` = 2, `week_pattern` = 'odd' WHERE `name` = 'Bi-Weekly (Odd)';
-- UPDATE `recurring_type` SET `cycle_weeks` = 2, `week_pattern` = 'even' WHERE `name` = 'Bi-Weekly (Even)';
