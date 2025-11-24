-- Verification Script for Schedule Cancellation Fix
-- Run these queries to verify the fix is working correctly

-- ============================================
-- 1. Check all canceled bookings and their schedules
-- ============================================
-- Expected: All future schedules for canceled bookings should be 'canceled' status
SELECT 
    b.id AS booking_id,
    b.status AS booking_status,
    b.type AS booking_type,
    s.id AS schedule_id,
    s.status AS schedule_status,
    s.isSkipped AS is_skipped,
    s.startTime AS start_time,
    CASE 
        WHEN s.startTime > NOW() THEN 'FUTURE'
        ELSE 'PAST'
    END AS schedule_timing
FROM bookings b
LEFT JOIN schedules s ON b.id = s.bookingId
WHERE b.status = 'canceled'
ORDER BY b.id, s.startTime;

-- ============================================
-- 2. Find orphaned active schedules (SHOULD BE EMPTY)
-- ============================================
-- Expected: Empty result - no active schedules for canceled bookings
SELECT 
    s.id AS schedule_id,
    s.status AS schedule_status,
    s.isSkipped AS is_skipped,
    s.startTime AS start_time,
    b.id AS booking_id,
    b.status AS booking_status
FROM schedules s
JOIN bookings b ON s.bookingId = b.id
WHERE b.status = 'canceled' 
  AND s.status NOT IN ('canceled', 'completed')
  AND s.startTime > NOW();

-- ============================================
-- 3. Count schedules by status for canceled bookings
-- ============================================
SELECT 
    b.status AS booking_status,
    s.status AS schedule_status,
    COUNT(*) AS count
FROM bookings b
JOIN schedules s ON b.id = s.bookingId
WHERE b.status = 'canceled'
GROUP BY b.status, s.status
ORDER BY s.status;

-- ============================================
-- 4. Check if staff availability was freed up
-- ============================================
-- Shows schedules that were canceled and their staff assignments
SELECT 
    s.id AS schedule_id,
    s.startTime,
    s.endTime,
    s.staffId,
    u.name AS staff_name,
    b.id AS booking_id,
    b.status AS booking_status,
    s.status AS schedule_status
FROM schedules s
LEFT JOIN users u ON s.staffId = u.id
JOIN bookings b ON s.bookingId = b.id
WHERE s.status = 'canceled'
  AND s.startTime > NOW()
ORDER BY s.startTime;

-- ============================================
-- 5. Verify no conflicting schedules for same staff/time
-- ============================================
-- Should show if there are multiple schedules for same staff at same time
-- (one should be canceled)
SELECT 
    s1.staffId,
    s1.startTime,
    s1.endTime,
    s1.id AS schedule1_id,
    s1.status AS schedule1_status,
    s2.id AS schedule2_id,
    s2.status AS schedule2_status,
    b1.id AS booking1_id,
    b2.id AS booking2_id
FROM schedules s1
JOIN schedules s2 ON 
    s1.staffId = s2.staffId 
    AND s1.id != s2.id
    AND s1.startTime < s2.endTime 
    AND s1.endTime > s2.startTime
JOIN bookings b1 ON s1.bookingId = b1.id
JOIN bookings b2 ON s2.bookingId = b2.id
WHERE s1.startTime > NOW()
ORDER BY s1.startTime;

-- ============================================
-- 6. Summary statistics
-- ============================================
SELECT 
    'Total Bookings' AS metric,
    COUNT(*) AS count
FROM bookings
UNION ALL
SELECT 
    'Canceled Bookings' AS metric,
    COUNT(*) AS count
FROM bookings 
WHERE status = 'canceled'
UNION ALL
SELECT 
    'Total Schedules' AS metric,
    COUNT(*) AS count
FROM schedules
UNION ALL
SELECT 
    'Canceled Schedules' AS metric,
    COUNT(*) AS count
FROM schedules 
WHERE status = 'canceled'
UNION ALL
SELECT 
    'Active Schedules (Future)' AS metric,
    COUNT(*) AS count
FROM schedules 
WHERE status NOT IN ('canceled', 'completed', 'rescheduled')
  AND startTime > NOW()
UNION ALL
SELECT 
    'Skipped Schedules' AS metric,
    COUNT(*) AS count
FROM schedules 
WHERE isSkipped = true;

-- ============================================
-- 7. Recent cancellations (Last 30 days)
-- ============================================
SELECT 
    b.id AS booking_id,
    b.updatedAt AS canceled_at,
    COUNT(s.id) AS total_schedules,
    SUM(CASE WHEN s.status = 'canceled' THEN 1 ELSE 0 END) AS canceled_schedules,
    SUM(CASE WHEN s.startTime > NOW() THEN 1 ELSE 0 END) AS future_schedules
FROM bookings b
LEFT JOIN schedules s ON b.id = s.bookingId
WHERE b.status = 'canceled'
  AND b.updatedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY b.id, b.updatedAt
ORDER BY b.updatedAt DESC;
