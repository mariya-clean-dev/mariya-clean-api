# Chat Module - Quick Start

## Overview
This module provides real-time chat functionality between parents and donors with WhatsApp-style continuous sessions.

## Setup

1. **Install Dependencies** (already done)
   ```bash
   npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
   ```

2. **Run Database Migration**
   ```bash
   npm run prisma:migrate
   ```

3. **Start the Server**
   ```bash
   npm run start:dev
   ```

## Module Structure

```
src/chat/
├── dto/
│   ├── send-message.dto.ts      # DTO for sending messages
│   ├── get-sessions.dto.ts      # DTO for listing sessions
│   ├── get-messages.dto.ts      # DTO for listing messages
│   └── mark-read.dto.ts         # DTO for marking messages as read
├── chat.service.ts              # Business logic
├── chat.controller.ts           # REST API endpoints
├── chat.gateway.ts              # WebSocket gateway
├── chat.module.ts               # Module definition
└── README.md                    # This file
```

## Quick API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/chat/sessions` | List all chat sessions |
| GET | `/chat/sessions/:id/messages` | Get messages for a session |
| POST | `/chat/messages` | Send a message (REST fallback) |
| POST | `/chat/messages/read` | Mark messages as read |
| GET | `/chat/unread-count` | Get total unread count |
| GET | `/chat/session/:userId` | Get/create session with user |

### WebSocket Events

#### Client to Server:
- `sendMessage` - Send a new message
- `joinSession` - Join a chat session room
- `leaveSession` - Leave a chat session room
- `typing` - Send typing indicator
- `markAsRead` - Mark messages as read
- `markAsDelivered` - Mark messages as delivered

#### Server to Client:
- `messageSent` - Confirmation of sent message
- `newMessage` - New message received
- `userTyping` - Other user is typing
- `messagesRead` - Messages were read
- `messagesDelivered` - Messages were delivered

## Authentication

All endpoints and WebSocket connections require JWT authentication:

**REST API:**
```
Authorization: Bearer <jwt-token>
```

**WebSocket:**
```javascript
const socket = io('http://localhost:3000/chat', {
  auth: { token: 'jwt-token' }
});
```

## Key Features

✅ Persistent chat sessions (one per parent-donor pair)
✅ Real-time messaging via WebSocket
✅ Complete message history with pagination
✅ Read receipts and delivery status
✅ Typing indicators
✅ Unread message counts
✅ REST API fallback for reliability
✅ Automatic session creation
✅ JWT-based authentication

## Database Models

### ChatSession
- Unique session per parent-donor pair
- Tracks last message timestamp
- Supports active/inactive status

### ChatMessage
- Text content
- Read/delivered status with timestamps
- Linked to session and sender
- Indexed for fast queries

## Next Steps

1. Run the migration when database is ready: `npm run prisma:migrate`
2. Test REST endpoints using Postman or curl
3. Test WebSocket connection using Socket.IO client
4. Integrate with your frontend application

## Documentation

For complete documentation, see: `docs/CHAT_SYSTEM.md`
