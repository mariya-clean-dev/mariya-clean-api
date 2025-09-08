# Booking Heatmap Calendar API Documentation

This document describes the new heatmap calendar feature that shows booking counts for each day of a specified month.

## Overview

The heatmap calendar feature provides visual analytics for booking distribution across the days of a month. It's designed for staff and admin users to track booking patterns and workload distribution.

## Features

- **Monthly Booking Distribution**: Shows booking counts for each day of a specified month
- **Staff Filtering**: Optional filtering by specific staff member (admin can filter by any staff, staff can only see their own data)
- **Role-based Access**: Admin and staff have different levels of access
- **Comprehensive Analytics**: Includes summary statistics and booking status breakdown

## API Endpoints

### 1. Bookings Heatmap Calendar

**Endpoint**: `GET /bookings/heatmap/calendar`

**Description**: Retrieves booking heatmap data for a specific month and year

**Authentication**: Required (JWT Token)

**Authorization**: Admin, Staff

**Query Parameters**:
- `year` (required): Integer, the year (2020-2100)
- `month` (required): Integer, the month (1-12)
- `staffId` (optional): String, UUID of the staff member to filter by

**Example Request**:
```bash
GET /bookings/heatmap/calendar?year=2024&month=1&staffId=uuid-string
```

**Response Format**:
```json
{
  "success": true,
  "message": "Booking heatmap calendar data",
  "data": {
    "year": 2024,
    "month": 1,
    "staffId": "uuid-string-or-null",
    "totalBookings": 45,
    "heatmapData": [
      { "date": 1, "bookingCount": 10 },
      { "date": 2, "bookingCount": 8 },
      { "date": 3, "bookingCount": 12 },
      ...
      { "date": 31, "bookingCount": 5 }
    ]
  }
}
```

### 2. Analytics Heatmap Calendar

**Endpoint**: `GET /analytics/booking-heatmap`

**Description**: Enhanced heatmap analytics with additional statistical information

**Authentication**: Required (JWT Token)

**Authorization**: Admin, Staff

**Query Parameters**:
- `year` (required): Integer, the year (2020-2100)
- `month` (required): Integer, the month (1-12)
- `staffId` (optional): String, UUID of the staff member to filter by

**Example Request**:
```bash
GET /analytics/booking-heatmap?year=2024&month=1&staffId=uuid-string
```

**Response Format**:
```json
{
  "success": true,
  "message": "Booking Heatmap Calendar Analytics",
  "data": {
    "year": 2024,
    "month": 1,
    "monthName": "January",
    "daysInMonth": 31,
    "staffId": "uuid-string-or-null",
    "staffInfo": {
      "id": "uuid-string",
      "name": "Staff Name",
      "email": "staff@example.com"
    },
    "totalBookings": 45,
    "statusBreakdown": {
      "booked": 20,
      "pending": 10,
      "completed": 10,
      "canceled": 5
    },
    "heatmapData": [
      { "date": 1, "bookingCount": 10 },
      { "date": 2, "bookingCount": 8 },
      { "date": 3, "bookingCount": 12 },
      ...
      { "date": 31, "bookingCount": 5 }
    ]
  }
}
```

## Usage Examples

### 1. Admin viewing all bookings for January 2024
```bash
curl -X GET "http://localhost:3000/bookings/heatmap/calendar?year=2024&month=1" \
  -H "Authorization: Bearer your-jwt-token"
```

### 2. Admin viewing specific staff bookings
```bash
curl -X GET "http://localhost:3000/bookings/heatmap/calendar?year=2024&month=1&staffId=staff-uuid" \
  -H "Authorization: Bearer your-jwt-token"
```

### 3. Staff viewing their own bookings
```bash
curl -X GET "http://localhost:3000/bookings/heatmap/calendar?year=2024&month=1" \
  -H "Authorization: Bearer staff-jwt-token"
```

### 4. Enhanced analytics view
```bash
curl -X GET "http://localhost:3000/analytics/booking-heatmap?year=2024&month=1" \
  -H "Authorization: Bearer your-jwt-token"
```

## Security & Access Control

### Admin Users
- Can view heatmap for all bookings
- Can filter by any staff member using `staffId` parameter
- Can access both `/bookings/heatmap/calendar` and `/analytics/booking-heatmap` endpoints

### Staff Users
- Can only view their own booking heatmap data
- The `staffId` parameter is automatically overridden with their own user ID for security
- Can access both `/bookings/heatmap/calendar` and `/analytics/booking-heatmap` endpoints

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    "year must be an integer",
    "month must be between 1 and 12"
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized access"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Insufficient permissions"
}
```

## Implementation Details

### Data Source
- **Schedule data** is retrieved from the `schedules` table based on the `startTime` timestamp (not booking creation time)
- This ensures the heatmap shows when work is actually scheduled, not when bookings were created
- Staff filtering is applied via the `staffId` field in the schedules table
- Only non-skipped (`isSkipped: false`) and non-canceled schedules are included

### Performance Considerations
- The query is optimized to only select necessary fields (`id`, `startTime`, `staffId`, `status`, `bookingId`)
- Date filtering is done at the database level for efficiency using schedule start times
- Results are aggregated in-memory for heatmap generation
- Excludes canceled and skipped schedules to show accurate workload

### Frontend Integration Tips

1. **Calendar Visualization**: Use the heatmap data to create a visual calendar where each day's intensity corresponds to the booking count
2. **Color Coding**: Implement different colors or intensities based on booking count ranges
3. **Interactive Features**: Allow clicking on days to drill down into specific bookings
4. **Staff Filtering**: Provide dropdown for admin users to select different staff members
5. **Month Navigation**: Implement previous/next month navigation

### Example Frontend Usage

```javascript
// Fetch heatmap data
const fetchHeatmap = async (year, month, staffId = null) => {
  const params = new URLSearchParams({ year, month });
  if (staffId) params.append('staffId', staffId);
  
  const response = await fetch(`/bookings/heatmap/calendar?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  return response.json();
};

// Render heatmap
const renderHeatmap = (heatmapData) => {
  heatmapData.forEach(({ date, bookingCount }) => {
    const dayElement = document.querySelector(`[data-date="${date}"]`);
    dayElement.style.backgroundColor = getHeatmapColor(bookingCount);
    dayElement.textContent = bookingCount;
  });
};
```

## Testing

The implementation has been tested for:
- ✅ TypeScript compilation without errors
- ✅ Proper DTO validation
- ✅ Role-based access control
- ✅ Staff data isolation
- ✅ Date range handling

## Notes

- All dates are handled in UTC timezone
- The month parameter follows standard calendar months (1 = January, 12 = December)
- Empty days (no bookings) will have a `bookingCount` of 0
- The feature supports any month from year 2020 to 2100 as defined in the DTO validation
