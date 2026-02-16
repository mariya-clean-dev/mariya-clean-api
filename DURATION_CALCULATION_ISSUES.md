# Duration Calculation Issues - Analysis Report

## Critical Inconsistencies Found

### 1. **Multiple Duration Formulas with Different Buffers**

#### Formula A: Scheduler Service (getDurationFromAreaSize)
**Location:** `src/scheduler/scheduler.service.ts:1669-1672`
```typescript
export function getDurationFromAreaSize(
  area: number,
  durationMinutes: number,
): number {
  const buffer = Number(60);
  return buffer + (area / 500) * durationMinutes;
}
```
**Formula:** `60 + (area / 500) * durationMinutes`
**Buffer:** 60 minutes

**Used in:**
- Line 892: `generateSchedulesForDate()` - creating schedules in cron job
- Line 968: `generateSchedulesForBooking()` - creating schedules for bookings

---

#### Formula B: Bookings Controller
**Location:** `src/bookings/bookings.controller.ts:79-80`
```typescript
const durationMins =
  (createBookingDto.areaSize / 500) * service.durationMinutes;
```
**Formula:** `(area / 500) * durationMinutes`
**Buffer:** NONE (0 minutes)

**Used in:**
- Line 80: Calculating duration for booking creation
- Line 118: Passed to `checkStaffAvailabilityForRecurringBooking()`

---

#### Formula C: Recurring Availability Check
**Location:** `src/scheduler/scheduler.service.ts:1302`
```typescript
const bufferMins = 30;
const totalDuration = durationMins + bufferMins;
```
**Formula:** `durationMins + 30` (where durationMins comes from Formula B)
**Effective Formula:** `(area / 500) * durationMinutes + 30`
**Buffer:** 30 minutes

**Used in:**
- Line 1354: Checking staff availability for recurring bookings (60 days ahead)

---

#### Formula D: Services Service (Estimate)
**Location:** `src/services/services.service.ts:305`
```typescript
const totalDuration = (square_feet / 500) * service.durationMinutes;
```
**Formula:** `(area / 500) * durationMinutes`
**Buffer:** NONE (0 minutes)

**Used in:**
- Showing service estimates to customers

---

#### Formula E: Bookings Service
**Location:** `src/bookings/bookings.service.ts:322`
```typescript
const durationMins = (squareFeet / 500) * serviceDuration;
```
**Formula:** `(area / 500) * durationMinutes`
**Buffer:** NONE (0 minutes)

**Used in:**
- Returning booking details with duration

---

## The Problem

### Issue 1: Availability Check vs Actual Schedule Mismatch
```
Booking creation flow:
1. User requests booking → Controller calculates: (area/500) * duration [NO BUFFER]
2. Availability check uses → (area/500) * duration + 30 minutes [30 MIN BUFFER]
3. Actual schedule created with → 60 + (area/500) * duration [60 MIN BUFFER]

Result: System approves bookings based on 30-min slots but creates 60-min slots!
```

**Example:**
- Area: 1000 sqft
- Service duration: 60 minutes
- Controller calculates: `(1000/500) * 60 = 120 minutes`
- Availability check: `120 + 30 = 150 minutes` (checks 2.5 hour slot)
- Actual schedule: `60 + 120 = 180 minutes` (creates 3 hour slot!)

**Impact:** **30-minute discrepancy** can cause:
- Schedule overlaps/conflicts
- Staff double-booking
- Incorrect time estimates to customers

### Issue 2: User-Facing Estimate vs Actual Duration
```
Service estimate shown: (area/500) * duration [NO BUFFER]
Actual schedule uses: 60 + (area/500) * duration [60 MIN BUFFER]

Result: Customer sees one duration, gets scheduled for 60 minutes longer!
```

**Example:**
- Area: 1500 sqft
- Service duration: 90 minutes
- Estimate shown: `(1500/500) * 90 = 270 minutes (4.5 hours)`
- Actual schedule: `60 + 270 = 330 minutes (5.5 hours)`

**Impact:** **1-hour discrepancy** misleads customers about service length.

### Issue 3: Inconsistent Buffer Logic
- Why 60-minute buffer in schedules?
- Why 30-minute buffer in availability checks?
- Why no buffer in estimates?
- **No documentation explaining buffer rationale**

## Recommendations

### Option 1: Standardize with 60-Minute Buffer (Recommended)
**Pros:**
- Accounts for travel time, setup, cleanup
- Reduces schedule conflicts
- More realistic timing

**Changes needed:**
1. Update `bookings.controller.ts:79-80` to use `getDurationFromAreaSize()`
2. Remove redundant buffer in `scheduler.service.ts:1302` (already in formula)
3. Update `services.service.ts:305` to add 60-min buffer in estimates
4. Update `bookings.service.ts:322` to use shared function

### Option 2: Standardize with 30-Minute Buffer
**Pros:**
- More efficient scheduling
- Tighter time slots

**Changes needed:**
1. Change `getDurationFromAreaSize()` buffer from 60 to 30
2. Keep current availability check logic
3. Update estimates to include 30-min buffer

### Option 3: Standardize with No Buffer
**Pros:**
- Simplest calculation
- Most optimistic timing

**Cons:**
- No time for travel, setup, cleanup
- Higher risk of conflicts
- Not recommended for field services

## Proposed Solution: Centralized Duration Function

### Create shared utility:
```typescript
// src/common/utils/duration.utils.ts
export const DURATION_BUFFER_MINUTES = 60;

export function calculateServiceDuration(
  areaSize: number,
  baseDurationMinutes: number,
  includeBuffer: boolean = true
): number {
  const baseDuration = (areaSize / 500) * baseDurationMinutes;
  return includeBuffer ? DURATION_BUFFER_MINUTES + baseDuration : baseDuration;
}
```

### Usage:
```typescript
// For schedules (with buffer)
const duration = calculateServiceDuration(area, serviceDuration, true);

// For raw calculation (no buffer)
const duration = calculateServiceDuration(area, serviceDuration, false);
```

## Files Requiring Updates

1. ✅ `src/scheduler/scheduler.service.ts` - Keep `getDurationFromAreaSize()` as-is
2. ❌ `src/bookings/bookings.controller.ts:79-80` - Use `getDurationFromAreaSize()`
3. ❌ `src/scheduler/scheduler.service.ts:1302` - Remove extra buffer
4. ❌ `src/services/services.service.ts:305` - Add buffer or document as estimate-only
5. ❌ `src/bookings/bookings.service.ts:322` - Use shared function

## Testing Checklist

After fixes:
- [ ] One-time booking: Verify duration matches estimate
- [ ] Recurring booking: Verify all 60 days use same duration
- [ ] Availability check: Verify uses same duration as schedule creation
- [ ] Service estimate: Verify matches actual scheduled duration
- [ ] Staff allocation: Verify no overlapping schedules
- [ ] Time slots: Verify correctly show unavailable periods

## Impact Assessment

**Severity:** 🔴 **HIGH**
**Affected users:** All customers and staff
**Probability of bugs:** Very High
**Data integrity:** Schedule conflicts likely exist in database

## Immediate Action Required

1. Review existing schedules for overlaps
2. Implement centralized duration function
3. Update all 5 locations to use consistent calculation
4. Add documentation explaining buffer purpose
5. Test thoroughly before deployment
