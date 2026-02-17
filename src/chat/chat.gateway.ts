import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { UseGuards } from "@nestjs/common";
import { ChatService } from "./chat.service";
import { JwtService } from "@nestjs/jwt";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  cors: {
    origin: "*", // Configure this based on your frontend URL
    credentials: true,
  },
  namespace: "chat",
  transports: ['websocket', 'polling'], // Allow both WebSocket and polling
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets: Map<string, Set<string>> = new Map();

  constructor(
    private chatService: ChatService,
    private jwtService: JwtService
  ) { }

  afterInit(server: Server) {
    console.log('[ChatGateway] 🚀 WebSocket Gateway initialized');
    console.log('[ChatGateway] 📡 Namespace: /chat');
    console.log('[ChatGateway] 🔌 Transports: websocket, polling');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      console.log(`[ChatGateway] 🔌 Connection attempt from client: ${client.id}`);
      console.log(`[ChatGateway] 📋 Handshake auth:`, client.handshake.auth);
      console.log(`[ChatGateway] 📋 Headers:`, client.handshake.headers.authorization ? 'Present' : 'Missing');

      // Extract token from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(" ")[1];

      if (!token) {
        console.log(`[ChatGateway] ❌ No token provided by client: ${client.id}`);
        client.emit('error', { message: 'Authentication token required' });
        client.disconnect();
        return;
      }

      console.log(`[ChatGateway] 🔑 Token received (length: ${token.length})`);
      console.log(`[ChatGateway] 🔐 JWT_SECRET configured: ${process.env.JWT_SECRET ? 'Yes' : 'No (using default)'}`);

      // Verify JWT token
      let payload;
      try {
        payload = await this.jwtService.verifyAsync(token, {
          secret: process.env.JWT_SECRET || "your-secret-key",
        });
        console.log(`[ChatGateway] ✅ Token verified successfully`);
        console.log(`[ChatGateway] 👤 User ID from token:`, payload.sub);
      } catch (jwtError) {
        console.error(`[ChatGateway] ❌ JWT verification failed:`, jwtError.message);
        client.emit('error', { message: 'Invalid or expired token' });
        client.disconnect();
        return;
      }

      const userId = payload.sub;
      
      if (!userId) {
        console.error(`[ChatGateway] ❌ No user ID in token payload`);
        client.emit('error', { message: 'Invalid token payload' });
        client.disconnect();
        return;
      }

      client.userId = userId;

      // Track user socket connections
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(client.id);

      // Join user to their personal room
      client.join(`user:${userId}`);

      console.log(`[ChatGateway] ✅ Client connected: ${client.id}, User: ${userId}`);

      // Load and send any unread messages to the user
      try {
        await this.sendUnreadMessagesToUser(client, userId);
        console.log(`[ChatGateway] 📬 Unread messages loaded for user: ${userId}`);
      } catch (messageError) {
        console.error(`[ChatGateway] ⚠️ Error loading unread messages (non-fatal):`, messageError.message);
        // Don't disconnect - this is not critical
      }

      console.log(`[ChatGateway] 🎉 Connection fully established for user: ${userId}`);
    } catch (error) {
      console.error(`[ChatGateway] ❌ Unexpected error in handleConnection:`, error);
      console.error(`[ChatGateway] ❌ Error stack:`, error.stack);
      client.emit('error', { message: 'Connection failed: ' + error.message });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.userId;
    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
    }
    console.log(`[ChatGateway] 🔌 Client disconnected: ${client.id}, User: ${userId || 'unknown'}`);
  }

  @SubscribeMessage("sendMessage")
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { recipientId: string; content: string }
  ) {
    try {
      const senderId = client.userId;
      if (!senderId) {
        return { error: "Unauthorized" };
      }

      // Save message to database
      const message = await this.chatService.sendMessage(senderId, {
        recipientId: data.recipientId,
        content: data.content,
      });

      // Get session info from sender's perspective (otherUser = recipient)
      const senderSession = await this.chatService.getOrCreateSession(
        senderId,
        data.recipientId
      );

      // Check if recipient is online
      const isRecipientOnline = this.isUserOnline(data.recipientId);

      // Emit to sender (confirmation with newMessageSent event)
      this.server.to(`user:${senderId}`).emit("newMessageSent", {
        ...message,
        sessionId: senderSession.id,
        session: senderSession,
        recipientOnline: isRecipientOnline,
      });

      // If recipient is online, send message in real-time
      if (isRecipientOnline) {
        // Get session from recipient's perspective (otherUser = sender)
        const recipientSession = await this.chatService.getOrCreateSession(
          data.recipientId,
          senderId
        );

        this.server.to(`user:${data.recipientId}`).emit("newMessage", {
          ...message,
          sessionId: recipientSession.id,
          session: recipientSession,
        });
        console.log(
          `Message sent in real-time to online user ${data.recipientId}`
        );
      } else {
        // Recipient is offline - send push notification
        console.log(`Message saved for offline user ${data.recipientId}`);
        await this.chatService.sendChatPushNotification(
          data.recipientId,
          senderId,
          data.content,
          senderSession.id,
          message.id,
        );
      }

      return { success: true, message, recipientOnline: isRecipientOnline };
    } catch (error) {
      console.error("Error sending message:", error);
      return { error: error.message };
    }
  }

  @SubscribeMessage("joinSession")
  async handleJoinSession(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { sessionId: string }
  ) {
    try {
      const userId = client.userId;
      if (!userId) {
        return { error: "Unauthorized" };
      }

      // Verify user has access to this session
      const session = await this.chatService.getOrCreateSession(userId, userId);

      client.join(`session:${data.sessionId}`);
      return { success: true, sessionId: data.sessionId };
    } catch (error) {
      return { error: error.message };
    }
  }

  @SubscribeMessage("leaveSession")
  handleLeaveSession(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { sessionId: string }
  ) {
    client.leave(`session:${data.sessionId}`);
    return { success: true };
  }

  @SubscribeMessage("typing")
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { recipientId: string; isTyping: boolean }
  ) {
    const senderId = client.userId;
    if (!senderId) {
      return { error: "Unauthorized" };
    }

    // Notify recipient that user is typing
    this.server.to(`user:${data.recipientId}`).emit("userTyping", {
      userId: senderId,
      isTyping: data.isTyping,
    });

    return { success: true };
  }

  @SubscribeMessage("markAsRead")
  async handleMarkAsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageIds: string[] }
  ) {
    try {
      const userId = client.userId;
      if (!userId) {
        return { error: "Unauthorized" };
      }

      const result = await this.chatService.markMessagesAsRead(
        userId,
        data.messageIds
      );

      // Notify sender that messages were read
      const messages = await this.chatService["prisma"].chatMessage.findMany({
        where: { id: { in: data.messageIds } },
        select: { senderId: true },
      });

      const uniqueSenderIds = [...new Set(messages.map((m) => m.senderId))];
      uniqueSenderIds.forEach((senderId) => {
        this.server.to(`user:${senderId}`).emit("messagesRead", {
          messageIds: data.messageIds,
          readBy: userId,
        });
      });

      return { success: true, ...result };
    } catch (error) {
      return { error: error.message };
    }
  }

  @SubscribeMessage("markAsDelivered")
  async handleMarkAsDelivered(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageIds: string[] }
  ) {
    try {
      const userId = client.userId;
      if (!userId) {
        return { error: "Unauthorized" };
      }

      const result = await this.chatService.markMessagesAsDelivered(
        data.messageIds
      );

      // Notify sender that messages were delivered
      const messages = await this.chatService["prisma"].chatMessage.findMany({
        where: { id: { in: data.messageIds } },
        select: { senderId: true },
      });

      const uniqueSenderIds = [...new Set(messages.map((m) => m.senderId))];
      uniqueSenderIds.forEach((senderId) => {
        this.server.to(`user:${senderId}`).emit("messagesDelivered", {
          messageIds: data.messageIds,
        });
      });

      return { success: true, ...result };
    } catch (error) {
      return { error: error.message };
    }
  }

  // Method to notify users about new messages (can be called from service)
  notifyNewMessage(recipientId: string, message: any) {
    this.server.to(`user:${recipientId}`).emit("newMessage", message);
  }

  // Check if user is online
  isUserOnline(userId: string): boolean {
    return (
      this.userSockets.has(userId) && this.userSockets.get(userId).size > 0
    );
  }

  /**
   * Send all unread messages to user when they reconnect
   */
  private async sendUnreadMessagesToUser(
    client: AuthenticatedSocket,
    userId: string
  ) {
    try {
      // Get all sessions for this user
      const sessions = await this.chatService["prisma"].chatSession.findMany({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      // Get all unread messages from these sessions
      const unreadMessages = await this.chatService[
        "prisma"
      ].chatMessage.findMany({
        where: {
          sessionId: { in: sessions.map((s) => s.id) },
          senderId: { not: userId }, // Not sent by this user
          isRead: false, // Unread messages
        },
        orderBy: { createdAt: "asc" },
        take: 100, // Limit to last 100 unread messages
      });

      // Send each unread message to the user
      if (unreadMessages.length > 0) {
        console.log(
          `Sending ${unreadMessages.length} unread messages to user ${userId}`
        );

        for (const message of unreadMessages) {
          client.emit("newMessage", message);
        }

        // Mark messages as delivered since user is now online
        const messageIds = unreadMessages.map((m) => m.id);
        await this.chatService.markMessagesAsDelivered(messageIds);
      }
    } catch (error) {
      console.error(`Error loading unread messages for user ${userId}:`, error);
    }
  }

  formatSession(session, otherUser, unreadCount, lastMessage) {
    return {
      id: session.id,
      userAId: session.userAId,
      userBId: session.userBId,
      lastMessageAt: session.lastMessageAt,
      isActive: session.isActive,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      otherUser: {
        id: otherUser.id,
        name: otherUser.name,
        email: otherUser.email,
      },
      unreadCount,
      lastMessage,
    };
  }
}
