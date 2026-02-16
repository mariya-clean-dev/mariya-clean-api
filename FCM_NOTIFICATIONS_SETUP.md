# FCM Push Notifications Setup Guide

## Overview

The application now includes a comprehensive Firebase Cloud Messaging (FCM) push notification system that notifies customers and staff about their schedules, status changes, and reschedules.

## Features Implemented

### 1. **Daily Morning Notifications**
- **Customers**: Receive notifications at 8:00 AM about their schedules for the day
- **Staff**: Receive notifications at 7:00 AM with a summary of their bookings for the day

### 2. **Status Change Notifications**
Customers and staff are notified when schedule status changes to:
- `completed` - Service completed
- `in_progress` - Service started
- `canceled` - Service canceled
- `payment_success` - Payment confirmed
- `payment_failed` - Payment failed

### 3. **Reschedule Notifications**
When a booking is rescheduled:
- **Customer**: Notified about the new date/time
- **Old Staff**: Notified if removed from the schedule
- **New Staff**: Notified about the new assignment

### 4. **FCM Token Management**
- API endpoint to update user's FCM token
- Tokens are stored per user and used for push notifications

---

## Installation

### 1. Install Firebase Admin SDK

```bash
npm install firebase-admin
```

### 2. Install TypeScript Types (if using TypeScript)

```bash
npm install --save-dev @types/firebase-admin
```

---

## Configuration

### 1. Get Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Download the JSON file

### 2. Set Environment Variable

You can provide the Firebase configuration in two ways:

#### Option A: JSON String (Recommended for Development)

Add to your `.env` file:

```env
FIREBASE_CONFIG='{"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'
```

#### Option B: Base64 Encoded (Recommended for Production)

1. Encode your service account JSON to base64:

```bash
# On Mac/Linux
cat firebase-service-account.json | base64

# On Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("firebase-service-account.json"))
```

2. Add to your `.env` file:

```env
FIREBASE_CONFIG=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwicHJvamVj...
```

---

## API Endpoints

### Update FCM Token

**Endpoint**: `PATCH /users/fcm-token`

**Authentication**: Required (JWT)

**Request Body**:
```json
{
  "fcmToken": "firebase-device-token-here"
}
```

**Response**:
```json
{
  "status": true,
  "message": "FCM token updated successfully",
  "data": {
    "id": "user-id",
    "name": "User Name",
    "email": "user@example.com",
    "fcmToken": "firebase-device-token-here"
  }
}
```

**Example (cURL)**:
```bash
curl -X PATCH http://localhost:3000/users/fcm-token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fcmToken": "your-firebase-token"}'
```

**Example (JavaScript/React Native)**:
```javascript
import messaging from '@react-native-firebase/messaging';

// Request permission
async function requestUserPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log('Authorization status:', authStatus);
    return true;
  }
  return false;
}

// Get FCM token and update backend
async function updateFCMToken() {
  const hasPermission = await requestUserPermission();
  
  if (hasPermission) {
    const token = await messaging().getToken();
    
    // Update token in backend
    await fetch('http://your-api/users/fcm-token', {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${userJwtToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fcmToken: token }),
    });
  }
}

// Listen for token refresh
messaging().onTokenRefresh(async (token) => {
  // Update token in backend
  await fetch('http://your-api/users/fcm-token', {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${userJwtToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fcmToken: token }),
  });
});
```

---

## Notification Schedule

### Daily Cron Jobs

The application runs two cron jobs daily:

1. **Staff Morning Notifications**: 7:00 AM EST
   - Sends each staff member a summary of their schedules for the day
   - Example: "Today's Schedule: 3 Bookings. First one at 9:00 AM."

2. **Customer Morning Notifications**: 8:00 AM EST
   - Reminds customers about their scheduled cleanings
   - Example: "Reminder: Cleaning Scheduled Today. You have a House Cleaning scheduled today at 10:00 AM with John."

### Real-time Notifications

Notifications are sent immediately when:
- Schedule status changes (completed, canceled, etc.)
- Booking is rescheduled
- Staff is assigned or reassigned

---

## Notification Types

All notifications are categorized by type in the database:

- `new_assignment` - Staff assigned to a booking
- `booking_reminder` - Daily reminders for customers and staff
- `status_change` - Schedule status updated
- `payment_confirmation` - Payment processed successfully

---

## Testing

### 1. Test FCM Token Update

```bash
curl -X PATCH http://localhost:3000/users/fcm-token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fcmToken": "test-token-123"}'
```

### 2. Test Status Change Notification

Use the schedule status change endpoint:

```bash
curl -X PATCH http://localhost:3000/scheduler/schedules/SCHEDULE_ID/change-status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

### 3. Monitor Logs

Check your application logs for notification events:
- `✅ FCM notification sent successfully`
- `🔔 Running daily customer notifications job...`
- `🔔 Running daily staff notifications job...`
- `✅ Status change notifications sent`
- `✅ Reschedule notifications sent`

---

## Troubleshooting

### Firebase Not Initialized

**Error**: `Firebase not initialized. Skipping push notification.`

**Solution**: 
- Verify `FIREBASE_CONFIG` is set in `.env`
- Check that the JSON is valid
- Restart the application

### Invalid Token Errors

**Error**: `messaging/invalid-registration-token`

**Solution**:
- Token may have expired
- User needs to refresh their FCM token
- Implement token refresh logic in the mobile app

### Notifications Not Received

**Checklist**:
1. ✅ Firebase Admin SDK initialized correctly
2. ✅ User has valid FCM token in database
3. ✅ Mobile app has notification permissions enabled
4. ✅ App is configured with correct Firebase project
5. ✅ Check device notification settings
6. ✅ Review Firebase Console for any errors

---

## Mobile App Integration

### React Native Example

```javascript
// App.js
import React, { useEffect } from 'react';
import messaging from '@react-native-firebase/messaging';
import PushNotification from 'react-native-push-notification';

function App() {
  useEffect(() => {
    // Request permission
    requestUserPermission();
    
    // Foreground notifications
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      console.log('FCM Message:', remoteMessage);
      
      // Show local notification
      PushNotification.localNotification({
        title: remoteMessage.notification.title,
        message: remoteMessage.notification.body,
        data: remoteMessage.data,
      });
    });
    
    // Background/Quit state notifications
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('Background Message:', remoteMessage);
    });
    
    return unsubscribe;
  }, []);
  
  return <YourApp />;
}
```

### Flutter Example

```dart
// main.dart
import 'package:firebase_messaging/firebase_messaging.dart';

Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  print("Handling background message: ${message.messageId}");
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  
  runApp(MyApp());
}

class MyApp extends StatefulWidget {
  @override
  _MyAppState createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  @override
  void initState() {
    super.initState();
    
    // Get FCM token
    FirebaseMessaging.instance.getToken().then((token) {
      print("FCM Token: $token");
      // Update backend with token
      updateFCMToken(token);
    });
    
    // Listen for foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print('Got a message in foreground!');
      print('Message data: ${message.data}');
      
      if (message.notification != null) {
        print('Message notification: ${message.notification}');
      }
    });
  }
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Firebase Cloud Messaging                 │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
                              │ Push Notifications
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Firebase Service                          │
│  - sendNotification()                                        │
│  - sendMulticast()                                           │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────┐
│               Notifications Service                          │
│  - createNotification() → Saves to DB + Sends FCM           │
│  - sendDailyCustomerNotifications() → Cron 8AM              │
│  - sendDailyStaffNotifications() → Cron 7AM                 │
│  - notifyScheduleStatusChange() → Real-time                 │
│  - notifyReschedule() → Real-time                           │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
                    ┌─────────┴─────────┐
                    │                   │
         ┌──────────────────┐  ┌──────────────────┐
         │ Scheduler Service│  │ Booking Service  │
         │  - Status Change │  │  - Reschedule    │
         └──────────────────┘  └──────────────────┘
```

---

## Database Schema

The `fcmToken` field is already in the User model:

```prisma
model User {
  id               String     @id @default(uuid())
  name             String
  email            String     @unique
  fcmToken         String?    @map("fcm_token")  // ✅ FCM Token
  // ... other fields
}
```

---

## Production Checklist

- [ ] Install `firebase-admin` package
- [ ] Configure `FIREBASE_CONFIG` environment variable
- [ ] Test FCM token update endpoint
- [ ] Test notification sending
- [ ] Configure mobile app with Firebase
- [ ] Request notification permissions in mobile app
- [ ] Implement token refresh logic in mobile app
- [ ] Monitor notification delivery in Firebase Console
- [ ] Set up error tracking for failed notifications
- [ ] Configure timezone for cron jobs if needed

---

## Support

For issues or questions:
1. Check Firebase Console for errors
2. Review application logs
3. Verify environment configuration
4. Test with FCM test tokens from Firebase Console
