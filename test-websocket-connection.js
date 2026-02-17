#!/usr/bin/env node

/**
 * WebSocket Connection Test Script
 * 
 * This script tests the WebSocket connection to the chat gateway.
 * 
 * Usage:
 *   1. Make sure the server is running (npm run start:dev)
 *   2. Get a valid JWT token from login
 *   3. Run: node test-websocket-connection.js YOUR_JWT_TOKEN
 */

const io = require('socket.io-client');

// Get token from command line argument
const token = process.argv[2];

if (!token) {
    console.error('❌ Error: Please provide a JWT token');
    console.log('Usage: node test-websocket-connection.js YOUR_JWT_TOKEN');
    process.exit(1);
}

console.log('🔧 Testing WebSocket Connection...\n');
console.log('🔑 Token (first 20 chars):', token.substring(0, 20) + '...');
console.log('🔑 Token length:', token.length);
console.log('');

// Create socket connection
const socket = io('ws://localhost:3000/chat', {
    auth: {
        token: token
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
    timeout: 10000,
});

let connectionEstablished = false;

// Connection event
socket.on('connect', () => {
    connectionEstablished = true;
    console.log('✅ Successfully connected to WebSocket server');
    console.log(`   Socket ID: ${socket.id}`);
    console.log(`   Transport: ${socket.io.engine.transport.name}`);
    console.log('   Waiting for server confirmation...\n');

    // You can test sending a message here
    // Uncomment and replace recipientId with a valid user ID
    /*
    socket.emit('sendMessage', {
      recipientId: 'recipient-user-id',
      content: 'Test message from connection script'
    }, (response) => {
      console.log('📨 Message response:', response);
      disconnect();
    });
    */

    // For now, just wait to see if connection stays stable
    setTimeout(() => {
        if (socket.connected) {
            console.log('✅ Connection test successful! Connection stable for 3 seconds.');
            disconnect();
        }
    }, 3000);
});

// Disconnect event
socket.on('disconnect', (reason) => {
    if (!connectionEstablished) {
        console.error(`❌ Disconnected before connection was established`);
        console.error(`   Reason: ${reason}`);
        console.error('\nThis usually means:');
        console.error('  - Server rejected the connection (auth failed)');
        console.error('  - Check server logs for detailed error message');
    } else {
        console.log(`🔌 Disconnected: ${reason}`);
    }
});

// Error event from server
socket.on('error', (error) => {
    console.error('❌ Server Error:', error);
    console.error('   This error was sent by the server, check what went wrong');
});

// Connection error
socket.on('connect_error', (error) => {
    console.error('❌ Connection Error:', error.message);
    console.error(`   Error type: ${error.type || 'unknown'}`);
    console.error(`   Description: ${error.description || 'none'}`);
    console.error('\nPossible causes:');
    console.error('  1. Server is not running (run: npm run start:dev)');
    console.error('  2. Invalid JWT token (check token is valid and not expired)');
    console.error('  3. Server port is different from 3000');
    console.error('  4. WebSocket gateway not properly configured');
    console.error('  5. JWT_SECRET mismatch between login and WebSocket');
    console.error('\n💡 Next steps:');
    console.error('  - Check server logs for detailed error');
    console.error('  - Verify your token with: jwt.io');
    console.error('  - Make sure JWT_SECRET env variable is set on server');
    disconnect();
});

// Connection timeout
socket.on('connect_timeout', (timeout) => {
    console.error('❌ Connection Timeout');
    console.error('\nPossible causes:');
    console.error('  1. Server is not responding');
    console.error('  2. Firewall blocking the connection');
    console.error('  3. Network issues');
    disconnect();
});

// New message event (for testing)
socket.on('newMessage', (data) => {
    console.log('📨 New message received:', data);
});

function disconnect() {
    if (socket.connected) {
        socket.disconnect();
    }
    process.exit(0);
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n\n👋 Terminating...');
    disconnect();
});

console.log('⏳ Attempting to connect to ws://localhost:3000/chat');
console.log('   Transports: websocket, polling');
console.log('   Timeout: 10 seconds\n');
