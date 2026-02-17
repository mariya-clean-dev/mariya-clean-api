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

// Connection event
socket.on('connect', () => {
  console.log('✅ Successfully connected to WebSocket server');
  console.log(`   Socket ID: ${socket.id}`);
  console.log(`   Transport: ${socket.io.engine.transport.name}`);
  console.log('\n📡 Sending test message...');
  
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
  
  // For now, just disconnect after successful connection
  setTimeout(() => {
    console.log('\n✅ Connection test successful!');
    disconnect();
  }, 2000);
});

// Disconnect event
socket.on('disconnect', (reason) => {
  console.log(`🔌 Disconnected: ${reason}`);
});

// Connection error
socket.on('connect_error', (error) => {
  console.error('❌ Connection Error:', error.message);
  console.error('\nPossible causes:');
  console.error('  1. Server is not running (run: npm run start:dev)');
  console.error('  2. Invalid JWT token');
  console.error('  3. Server port is different from 3000');
  console.error('  4. WebSocket gateway not properly configured');
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

// Error event
socket.on('error', (error) => {
  console.error('❌ Socket Error:', error);
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
