# Chat WebSocket Implementation

## Overview
This document describes the real-time chat WebSocket implementation using Socket.IO with JWT authentication.

## Connection URL

### Development
```
ws://localhost:3000/chat
```

### Production
```
wss://your-domain.com/chat
```

**Important Notes:**
- The WebSocket server runs on the same port as the API server (default: 3000)
- The namespace is `chat` (configured in ChatGateway)
- WebSocket URLs are **NOT** affected by the global API prefix (`/api`)
- REST API endpoints use `/api` prefix, but WebSocket connections do not

## Authentication

The WebSocket connection requires JWT authentication. The token can be provided in two ways:

### Method 1: Auth Object (Recommended)
```javascript
const socket = io('ws://localhost:3000/chat', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Method 2: Authorization Header
```javascript
const socket = io('ws://localhost:3000/chat', {
  extraHeaders: {
    Authorization: 'Bearer your-jwt-token'
  }
});
```

> **Important:** If authentication fails, the connection will be immediately disconnected.

## Connection Lifecycle

### Connection Event
When a client connects successfully:
1. JWT token is verified
2. User is assigned to their personal room (`user:{userId}`)
3. All unread messages are sent to the client
4. Messages are marked as delivered

### Disconnection Event
When a client disconnects:
- User's socket is removed from tracking
- No automatic cleanup of chat data

## Client-to-Server Events

### 1. sendMessage
Send a message to another user.

**Emit:**
```javascript
socket.emit('sendMessage', {
  recipientId: 'user-id',
  content: 'Hello, world!'
});
```

**Response:**
```javascript
{
  success: true,
  message: {
    id: 'message-id',
    content: 'Hello, world!',
    senderId: 'your-user-id',
    recipientId: 'recipient-user-id',
    sessionId: 'session-id',
    isRead: false,
    isDelivered: false,
    createdAt: '2026-02-17T10:00:00.000Z'
  },
  recipientOnline: true
}
```

**Behavior:**
- Saves message to database
- Emits `newMessageSent` to sender
- If recipient is online: emits `newMessage` to recipient
- If recipient is offline: sends push notification

---

### 2. joinSession
Join a specific chat session room.

**Emit:**
```javascript
socket.emit('joinSession', {
  sessionId: 'session-id'
});
```

**Response:**
```javascript
{
  success: true,
  sessionId: 'session-id'
}
```

---

### 3. leaveSession
Leave a specific chat session room.

**Emit:**
```javascript
socket.emit('leaveSession', {
  sessionId: 'session-id'
});
```

**Response:**
```javascript
{
  success: true
}
```

---

### 4. typing
Notify another user that you are typing.

**Emit:**
```javascript
socket.emit('typing', {
  recipientId: 'user-id',
  isTyping: true
});
```

**Response:**
```javascript
{
  success: true
}
```

**Behavior:**
- Emits `userTyping` event to the recipient

---

### 5. markAsRead
Mark messages as read.

**Emit:**
```javascript
socket.emit('markAsRead', {
  messageIds: ['message-id-1', 'message-id-2']
});
```

**Response:**
```javascript
{
  success: true,
  updatedCount: 2
}
```

**Behavior:**
- Updates messages in database
- Emits `messagesRead` event to the sender(s)

---

### 6. markAsDelivered
Mark messages as delivered.

**Emit:**
```javascript
socket.emit('markAsDelivered', {
  messageIds: ['message-id-1', 'message-id-2']
});
```

**Response:**
```javascript
{
  success: true,
  updatedCount: 2
}
```

**Behavior:**
- Updates messages in database
- Emits `messagesDelivered` event to the sender(s)

---

## Server-to-Client Events

### 1. newMessage
Received when someone sends you a message.

**Listener:**
```javascript
socket.on('newMessage', (data) => {
  console.log('New message received:', data);
});
```

**Data Structure:**
```javascript
{
  id: 'message-id',
  content: 'Message content',
  senderId: 'sender-user-id',
  recipientId: 'your-user-id',
  sessionId: 'session-id',
  isRead: false,
  isDelivered: true,
  createdAt: '2026-02-17T10:00:00.000Z',
  session: {
    id: 'session-id',
    userAId: 'user-a-id',
    userBId: 'user-b-id',
    lastMessageAt: '2026-02-17T10:00:00.000Z',
    isActive: true,
    otherUser: {
      id: 'sender-user-id',
      name: 'Sender Name',
      email: 'sender@email.com'
    }
  }
}
```

---

### 2. newMessageSent
Confirmation event when you send a message.

**Listener:**
```javascript
socket.on('newMessageSent', (data) => {
  console.log('Message sent confirmation:', data);
});
```

**Data Structure:**
```javascript
{
  id: 'message-id',
  content: 'Message content',
  senderId: 'your-user-id',
  recipientId: 'recipient-user-id',
  sessionId: 'session-id',
  isRead: false,
  isDelivered: false,
  createdAt: '2026-02-17T10:00:00.000Z',
  session: { /* session details */ },
  recipientOnline: true
}
```

---

### 3. userTyping
Received when another user is typing.

**Listener:**
```javascript
socket.on('userTyping', (data) => {
  console.log('User typing status:', data);
});
```

**Data Structure:**
```javascript
{
  userId: 'user-id',
  isTyping: true
}
```

---

### 4. messagesRead
Received when your messages are read.

**Listener:**
```javascript
socket.on('messagesRead', (data) => {
  console.log('Messages read:', data);
});
```

**Data Structure:**
```javascript
{
  messageIds: ['message-id-1', 'message-id-2'],
  readBy: 'user-id'
}
```

---

### 5. messagesDelivered
Received when your messages are delivered.

**Listener:**
```javascript
socket.on('messagesDelivered', (data) => {
  console.log('Messages delivered:', data);
});
```

**Data Structure:**
```javascript
{
  messageIds: ['message-id-1', 'message-id-2']
}
```

---

## Complete Client Implementation Example

### Installation
```bash
npm install socket.io-client
```

### React/JavaScript Example

```javascript
import { io } from 'socket.io-client';

class ChatWebSocket {
  constructor(token) {
    this.socket = io('ws://localhost:3000/chat', {
      auth: {
        token: token
      }
    });

    this.setupListeners();
  }

  setupListeners() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to chat server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from chat server');
    });

    // Message events
    this.socket.on('newMessage', (data) => {
      console.log('New message:', data);
      // Update UI with new message
      this.handleNewMessage(data);
      
      // Mark as delivered
      this.markAsDelivered([data.id]);
    });

    this.socket.on('newMessageSent', (data) => {
      console.log('Message sent confirmation:', data);
      // Update UI with sent message
      this.handleMessageSent(data);
    });

    this.socket.on('userTyping', (data) => {
      console.log('User typing:', data);
      // Show typing indicator
      this.handleUserTyping(data);
    });

    this.socket.on('messagesRead', (data) => {
      console.log('Messages read:', data);
      // Update message status in UI
      this.handleMessagesRead(data);
    });

    this.socket.on('messagesDelivered', (data) => {
      console.log('Messages delivered:', data);
      // Update message status in UI
      this.handleMessagesDelivered(data);
    });
  }

  // Send a message
  sendMessage(recipientId, content) {
    return new Promise((resolve, reject) => {
      this.socket.emit('sendMessage', { recipientId, content }, (response) => {
        if (response.error) {
          reject(response.error);
        } else {
          resolve(response);
        }
      });
    });
  }

  // Join a session
  joinSession(sessionId) {
    this.socket.emit('joinSession', { sessionId });
  }

  // Leave a session
  leaveSession(sessionId) {
    this.socket.emit('leaveSession', { sessionId });
  }

  // Send typing indicator
  setTyping(recipientId, isTyping) {
    this.socket.emit('typing', { recipientId, isTyping });
  }

  // Mark messages as read
  markAsRead(messageIds) {
    this.socket.emit('markAsRead', { messageIds });
  }

  // Mark messages as delivered
  markAsDelivered(messageIds) {
    this.socket.emit('markAsDelivered', { messageIds });
  }

  // Handler methods (implement based on your UI framework)
  handleNewMessage(data) {
    // Add message to chat UI
  }

  handleMessageSent(data) {
    // Update sent message in UI
  }

  handleUserTyping(data) {
    // Show/hide typing indicator
  }

  handleMessagesRead(data) {
    // Update message read status
  }

  handleMessagesDelivered(data) {
    // Update message delivered status
  }

  // Disconnect
  disconnect() {
    this.socket.disconnect();
  }
}

// Usage
const jwtToken = 'your-jwt-token-here';
const chatWS = new ChatWebSocket(jwtToken);

// Send a message
chatWS.sendMessage('recipient-user-id', 'Hello!')
  .then(response => console.log('Message sent:', response))
  .catch(error => console.error('Error:', error));
```

---

## React Hook Example

```javascript
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export const useChatWebSocket = (token) => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!token) return;

    // Create socket connection
    socketRef.current = io('ws://localhost:3000/chat', {
      auth: { token }
    });

    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      console.log('Connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected');
      setIsConnected(false);
    });

    // Message events
    socket.on('newMessage', (data) => {
      setMessages(prev => [...prev, data]);
      // Auto-mark as delivered
      socket.emit('markAsDelivered', { messageIds: [data.id] });
    });

    socket.on('newMessageSent', (data) => {
      setMessages(prev => [...prev, data]);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, [token]);

  const sendMessage = (recipientId, content) => {
    return new Promise((resolve, reject) => {
      socketRef.current.emit('sendMessage', { recipientId, content }, (response) => {
        if (response.error) {
          reject(response.error);
        } else {
          resolve(response);
        }
      });
    });
  };

  const setTyping = (recipientId, isTyping) => {
    socketRef.current.emit('typing', { recipientId, isTyping });
  };

  const markAsRead = (messageIds) => {
    socketRef.current.emit('markAsRead', { messageIds });
  };

  return {
    isConnected,
    messages,
    sendMessage,
    setTyping,
    markAsRead,
    socket: socketRef.current
  };
};
```

---

## Error Handling

### Authentication Errors
If the JWT token is invalid or expired, the connection will be immediately closed.

```javascript
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server disconnected the client (likely auth failure)
    console.log('Disconnected by server - authentication failed');
    // Redirect to login or refresh token
  }
});
```

### Event Errors
All event handlers return an error object if something goes wrong:

```javascript
socket.emit('sendMessage', { recipientId, content }, (response) => {
  if (response.error) {
    console.error('Error:', response.error);
  }
});
```

---

## Testing

### Using Postman (WebSocket Support)
1. Create a new WebSocket request
2. URL: `ws://localhost:3000/chat`
3. Add headers: `Authorization: Bearer your-jwt-token`
4. Connect and send events

### Using Socket.IO Client Tool
```bash
npm install -g socket.io-client-tool
```

```bash
socket-io-client-tool \
  --url ws://localhost:3000/chat \
  --auth token=your-jwt-token
```

---

## Best Practices

1. **Reconnection Logic**: Implement automatic reconnection with exponential backoff
2. **Message Queue**: Queue messages when offline and send when reconnected
3. **Token Refresh**: Update the socket auth token when JWT is refreshed
4. **Typing Indicators**: Debounce typing events to avoid flooding the server
5. **Read Receipts**: Batch mark-as-read requests
6. **Error Handling**: Always handle errors in event responses
7. **Memory Management**: Clean up listeners when component unmounts

---

## Security Considerations

1. **JWT Validation**: All connections are validated with JWT tokens
2. **User Isolation**: Users can only access their own messages
3. **Session Verification**: Users are verified before joining sessions
4. **CORS Configuration**: Configure CORS origins in production
5. **Rate Limiting**: Consider implementing rate limiting for message sending

---

## Troubleshooting

### Invalid Namespace Error
If you get `Invalid namespace` error:
- Ensure you're connecting to `ws://localhost:3000/chat` (with `/chat` in the URL)
- Verify the server is running and ChatModule is properly imported in AppModule
- Check that ChatGateway uses `namespace: "chat"` (without leading slash in the decorator)
- Restart the server after making changes to gateway configuration

### Connection Refused
- Check if the server is running
- Verify the correct port is being used
- Check CORS configuration

### Messages Not Received
- Verify both users are connected
- Check if messages are being saved to database
- Verify user IDs are correct

### Authentication Failed
- Verify JWT token is valid and not expired
- Check token is being sent correctly in auth object or headers
- Verify JWT_SECRET matches server configuration

---

## API Endpoints (REST)

For initial data loading and session management, use these REST endpoints:

- `GET /api/chat/sessions` - Get all chat sessions
- `GET /api/chat/sessions/:sessionId/messages` - Get messages for a session
- `POST /api/chat/sessions` - Create a new chat session
- `DELETE /api/chat/sessions/:sessionId` - Delete a session

---

## Support

For issues or questions, please contact the development team or create an issue in the project repository.
