# WebSocket Client Disconnection - Debugging Guide

## Problem
Client connects to WebSocket but immediately disconnects.

## Root Causes (Most Common)

### 1. JWT Token Issues (90% of cases)
The most common reason for immediate disconnection is JWT authentication failure.

**Check these:**
- ✅ Token is not expired
- ✅ Token contains `sub` field (user ID)
- ✅ Token was signed with the same JWT_SECRET that the WebSocket gateway uses
- ✅ Token format is valid JWT

**How to verify:**
```bash
node verify-jwt-token.js YOUR_JWT_TOKEN
```

### 2. JWT_SECRET Mismatch
The token was created with a different JWT_SECRET than what the WebSocket gateway is using.

**Fix:**
1. Check `.env` file has JWT_SECRET defined
2. Make sure both auth service and WebSocket gateway use the same secret
3. Restart the server after changing JWT_SECRET

### 3. Token Missing User ID
The JWT payload doesn't contain the `sub` field with user ID.

**Server logs will show:**
```
[ChatGateway] ❌ No user ID in token payload
```

**Fix:**
Make sure your auth service includes `sub: user.id` in the JWT payload.

## Debugging Steps

### Step 1: Get a Fresh Token
```bash
# Login via API to get a new token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

### Step 2: Verify the Token
```bash
node verify-jwt-token.js YOUR_JWT_TOKEN
```

Expected output:
```
✅ Token is still valid (X minutes remaining)
✅ Token verification successful!
🎉 This token should work for WebSocket connection
```

### Step 3: Test Connection with Detailed Logs
```bash
# In one terminal - watch server logs
npm run start:dev

# In another terminal - test connection
node test-websocket-connection.js YOUR_JWT_TOKEN
```

### Step 4: Analyze Server Logs

**Successful Connection:**
```
[ChatGateway] 🔌 Connection attempt from client: abc123
[ChatGateway] 🔑 Token received (length: 250)
[ChatGateway] 🔐 JWT_SECRET configured: Yes
[ChatGateway] ✅ Token verified successfully
[ChatGateway] 👤 User ID from token: 123e4567-e89b-12d3-a456-426614174000
[ChatGateway] ✅ Client connected: abc123, User: 123e4567-e89b-12d3-a456-426614174000
[ChatGateway] 📬 Unread messages loaded for user: 123e4567-e89b-12d3-a456-426614174000
[ChatGateway] 🎉 Connection fully established for user: 123e4567-e89b-12d3-a456-426614174000
```

**Failed - No Token:**
```
[ChatGateway] ❌ No token provided by client: abc123
```

**Failed - Invalid Token:**
```
[ChatGateway] ❌ JWT verification failed: jwt malformed
[ChatGateway] ❌ JWT verification failed: invalid signature
[ChatGateway] ❌ JWT verification failed: jwt expired
```

**Failed - Missing User ID:**
```
[ChatGateway] ❌ No user ID in token payload
```

## Quick Fixes

### Fix 1: Token Expired
**Problem:** Token has expired
**Solution:** Login again to get a new token

### Fix 2: JWT_SECRET Mismatch
**Problem:** Different secrets used for signing vs verification
**Solution:**
```bash
# Make sure .env has JWT_SECRET
echo "JWT_SECRET=your-secret-key-here" >> .env

# Restart server
npm run start:dev
```

### Fix 3: Invalid Token Format
**Problem:** Token is not a valid JWT
**Solution:** Get a fresh token from the login endpoint

### Fix 4: Missing Dependencies
**Problem:** `jsonwebtoken` not installed for verification script
**Solution:**
```bash
npm install jsonwebtoken dotenv
```

## Server-Side Enhancements

The following enhancements have been added to help debug:

1. **Detailed Connection Logs** - Every connection attempt is logged with detailed info
2. **Error Messages to Client** - Server emits 'error' events with helpful messages
3. **Token Verification Logging** - Shows token length, JWT_SECRET presence, verification results
4. **User ID Validation** - Checks if user ID exists in token payload
5. **Non-fatal Error Handling** - Unread message errors don't disconnect the client

## Client-Side Best Practices

```javascript
const socket = io('ws://localhost:3000/chat', {
  auth: { token: 'your-jwt-token' },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
});

// Essential error handlers
socket.on('connect', () => {
  console.log('Connected!', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  if (reason === 'io server disconnect') {
    // Server disconnected us (likely auth failure)
    // Get a new token and reconnect
  }
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});

socket.on('error', (error) => {
  // Error message from server
  console.error('Server error:', error);
});
```

## Still Having Issues?

1. **Check Environment Variables:**
   ```bash
   # Make sure JWT_SECRET is set
   echo $JWT_SECRET
   ```

2. **Verify Server is Running:**
   ```bash
   curl http://localhost:3000/api
   ```

3. **Check Port:**
   - Default is 3000
   - Check `process.env.PORT` in your environment

4. **Check Firewall:**
   - Make sure port 3000 is not blocked
   - Try with `transports: ['polling']` only

5. **Check CORS:**
   - Gateway has `origin: "*"` but verify your frontend origin is allowed

## Contact
If still having issues after following these steps, provide:
- Server logs from connection attempt
- Client console output
- Output from verify-jwt-token.js script
