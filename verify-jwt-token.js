#!/usr/bin/env node

/**
 * JWT Token Verification Utility
 * 
 * This script helps diagnose JWT token issues before connecting to WebSocket
 * 
 * Usage:
 *   node verify-jwt-token.js YOUR_JWT_TOKEN
 */

let jwt;
try {
    jwt = require('jsonwebtoken');
} catch (e) {
    console.error('❌ Error: jsonwebtoken package not found');
    console.error('Install it with: npm install jsonwebtoken');
    process.exit(1);
}

// Get token from command line argument
const token = process.argv[2];

if (!token) {
    console.error('❌ Error: Please provide a JWT token');
    console.log('Usage: node verify-jwt-token.js YOUR_JWT_TOKEN');
    process.exit(1);
}

console.log('🔍 JWT Token Verification\n');
console.log('Token (first 30 chars):', token.substring(0, 30) + '...');
console.log('Token length:', token.length);
console.log('');

// Decode without verification first
try {
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) {
        console.error('❌ Failed to decode token - invalid JWT format');
        process.exit(1);
    }
    
    console.log('📋 Token Header:');
    console.log('   Algorithm:', decoded.header.alg);
    console.log('   Type:', decoded.header.typ);
    console.log('');
    
    console.log('📋 Token Payload:');
    console.log('   Email:', decoded.payload.email || 'N/A');
    console.log('   User ID (sub):', decoded.payload.sub || '❌ MISSING');
    console.log('   Role:', decoded.payload.role || 'N/A');
    console.log('   Issued At:', decoded.payload.iat ? new Date(decoded.payload.iat * 1000).toISOString() : 'N/A');
    console.log('   Expires At:', decoded.payload.exp ? new Date(decoded.payload.exp * 1000).toISOString() : 'Never');
    console.log('');
    
    // Check if expired
    if (decoded.payload.exp) {
        const now = Math.floor(Date.now() / 1000);
        if (decoded.payload.exp < now) {
            console.error('❌ TOKEN IS EXPIRED');
            const expiredDate = new Date(decoded.payload.exp * 1000);
            console.error(`   Expired at: ${expiredDate.toISOString()}`);
            console.error(`   Current time: ${new Date().toISOString()}`);
            console.error('\n💡 Solution: Generate a new token by logging in again');
            process.exit(1);
        } else {
            const timeLeft = decoded.payload.exp - now;
            const minutesLeft = Math.floor(timeLeft / 60);
            console.log(`✅ Token is still valid (${minutesLeft} minutes remaining)`);
        }
    }
    
    // Check if user ID exists
    if (!decoded.payload.sub) {
        console.error('❌ CRITICAL: Token payload missing "sub" field (user ID)');
        console.error('   WebSocket connection will fail without user ID');
        process.exit(1);
    }
    
    console.log('');
    
    // Try to verify with JWT_SECRET
    console.log('🔐 Attempting to verify with JWT_SECRET...');
    
    // Load .env file if available
    try {
        require('dotenv').config();
    } catch (e) {
        // dotenv not installed, continuing without it
    }
    
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    
    if (!process.env.JWT_SECRET) {
        console.warn('⚠️  JWT_SECRET not found in environment, using default: "your-secret-key"');
    } else {
        console.log('✅ JWT_SECRET loaded from environment');
    }
    
    try {
        const verified = jwt.verify(token, secret);
        console.log('✅ Token verification successful!');
        console.log('');
        console.log('🎉 This token should work for WebSocket connection');
        console.log('');
        console.log('Next step:');
        console.log(`   node test-websocket-connection.js ${token.substring(0, 30)}...`);
    } catch (verifyError) {
        console.error('❌ Token verification FAILED:', verifyError.message);
        console.error('');
        console.error('Common causes:');
        console.error('  1. JWT_SECRET mismatch - token was signed with different secret');
        console.error('  2. Token signature is invalid or corrupted');
        console.error('  3. Token format is incorrect');
        console.error('');
        console.error('💡 Solution:');
        console.error('  - Make sure JWT_SECRET environment variable matches between:');
        console.error('    * Where the token was created (auth service)');
        console.error('    * WebSocket gateway verification');
        console.error('  - Generate a new token by logging in again');
        process.exit(1);
    }
    
} catch (error) {
    console.error('❌ Error decoding token:', error.message);
    console.error('');
    console.error('This token is not a valid JWT');
    process.exit(1);
}
