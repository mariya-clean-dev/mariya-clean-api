import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FirebaseService } from "../firebase/firebase.service";
import { SendMessageDto } from "./dto/send-message.dto";

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private firebaseService: FirebaseService,
  ) {}

  /**
   * Get or create a chat session between two users
   */
  async getOrCreateSession(userId1: string, userId2: string) {
    // Verify both users exist
    const [user1, user2] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId1 },
        select: { id: true, name: true, email: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId2 },
        select: { id: true, name: true, email: true },
      }),
    ]);

    if (!user1 || !user2) {
      throw new NotFoundException('One or both users not found');
    }

    // Assign userAId and userBId using alphabetical ordering for consistency
    const [userAId, userBId] = [userId1, userId2].sort();

    // Fetch session with last message
    let session = await this.prisma.chatSession.findUnique({
      where: {
        userAId_userBId: { userAId, userBId },
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    // Create if not exists
    if (!session) {
      session = await this.prisma.chatSession.create({
        data: { userAId, userBId },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
    }

    const lastMessage = session.messages?.[0] || null;

    // Determine the OTHER user relative to the requester (userId1)
    // The other user is the one who is NOT userId1
    const otherUserId = userId1 === session.userAId ? session.userBId : session.userAId;

    const otherUser = await this.prisma.user.findUnique({
      where: { id: otherUserId },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    // Unread messages for the current user
    const unreadCount = await this.prisma.chatMessage.count({
      where: {
        sessionId: session.id,
        isRead: false,
        senderId: otherUserId, // unread = messages sent by other user
      },
    });

    // Build formatted response
    const formattedSession = {
      id: session.id,
      userAId: session.userAId,
      userBId: session.userBId,
      lastMessageAt: lastMessage?.createdAt || session.createdAt,
      isActive: session.isActive,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      otherUser,
      unreadCount,
      lastMessage,
    };

    return formattedSession;
  }

  /**
   * Get all chat sessions for a user with pagination
   */
  async getUserSessions(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.prisma.chatSession.findMany({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
          isActive: true,
        },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: {
          lastMessageAt: "desc",
        },
        skip,
        take: limit,
      }),
      this.prisma.chatSession.count({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
          isActive: true,
        },
      }),
    ]);

    // Get other participant details for each session
    const sessionsWithParticipants = await Promise.all(
      sessions.map(async (session) => {
        const otherUserId =
          session.userAId === userId ? session.userBId : session.userAId;
        const otherUser = await this.prisma.user.findUnique({
          where: { id: otherUserId },
          select: {
            id: true,
            name: true,
            email: true,
          },
        });

        // Count unread messages for this session
        const unreadCount = await this.prisma.chatMessage.count({
          where: {
            sessionId: session.id,
            senderId: otherUserId,
            isRead: false,
          },
        });

        return {
          ...session,
          otherUser,
          unreadCount,
          lastMessage: session.messages[0] || null,
        };
      })
    );

    return {
      sessions: sessionsWithParticipants,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get messages for a specific session
   */
  async getSessionMessages(
    sessionId: string,
    userId: string,
    page: number = 1,
    limit: number = 50
  ) {
    // Verify user is part of this session
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException("Chat session not found");
    }

    if (session.userAId !== userId && session.userBId !== userId) {
      throw new ForbiddenException(
        "You do not have access to this chat session"
      );
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.chatMessage.count({
        where: { sessionId },
      }),
    ]);

    return {
      messages: messages.reverse(), // Return in chronological order
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Send a message
   */
  async sendMessage(senderId: string, dto: SendMessageDto) {
    const { recipientId, content } = dto;

    // Verify both users exist
    const [sender, recipient] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: senderId } }),
      this.prisma.user.findUnique({ where: { id: recipientId } }),
    ]);

    if (!sender || !recipient) {
      throw new NotFoundException("User not found");
    }

    // Get or create session
    const session = await this.getOrCreateSession(senderId, recipientId);

    // Create message
    const message = await this.prisma.chatMessage.create({
      data: {
        content,
        senderId,
        sessionId: session.id,
        sentAt: new Date(),
      },
    });

    // Update session's lastMessageAt
    await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { lastMessageAt: new Date() },
    });

    return message;
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(userId: string, messageIds: string[]) {
    // Verify user has access to these messages (they should be the recipient)
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        id: { in: messageIds },
      },
      include: {
        session: true,
      },
    });

    // Filter messages where user is the recipient (not the sender)
    const validMessageIds = messages
      .filter((msg) => {
        const isParticipant =
          msg.session.userAId === userId || msg.session.userBId === userId;
        const isNotSender = msg.senderId !== userId;
        return isParticipant && isNotSender;
      })
      .map((msg) => msg.id);

    if (validMessageIds.length === 0) {
      return { updated: 0 };
    }

    const result = await this.prisma.chatMessage.updateMany({
      where: {
        id: { in: validMessageIds },
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { updated: result.count };
  }

  /**
   * Mark messages as delivered
   */
  async markMessagesAsDelivered(messageIds: string[]) {
    const result = await this.prisma.chatMessage.updateMany({
      where: {
        id: { in: messageIds },
        isDelivered: false,
      },
      data: {
        isDelivered: true,
        deliveredAt: new Date(),
      },
    });

    return { updated: result.count };
  }

  /**
   * Get unread message count for a user
   */
  async getUnreadCount(userId: string) {
    const sessions = await this.prisma.chatSession.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        isActive: true,
      },
      select: {
        id: true,
        userAId: true,
        userBId: true,
      },
    });

    const unreadCount = await this.prisma.chatMessage.count({
      where: {
        sessionId: { in: sessions.map((s) => s.id) },
        senderId: { not: userId },
        isRead: false,
      },
    });

    return { unreadCount };
  }

  /**
   * Send push notification for a chat message
   */
  async sendChatPushNotification(
    recipientId: string,
    senderId: string,
    messageContent: string,
    sessionId: string,
    messageId: string,
  ): Promise<void> {
    try {
      // Get recipient's FCM token and sender's name
      const [recipient, sender] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: recipientId },
          select: { fcmToken: true, name: true },
        }),
        this.prisma.user.findUnique({
          where: { id: senderId },
          select: { name: true },
        }),
      ]);

      if (!recipient?.fcmToken) {
        this.logger.warn(
          `No FCM token found for user ${recipientId}. Push notification not sent.`,
        );
        return;
      }

      if (!sender) {
        this.logger.warn(`Sender ${senderId} not found`);
        return;
      }

      // Truncate message content if too long
      const truncatedContent =
        messageContent.length > 100
          ? messageContent.substring(0, 97) + "..."
          : messageContent;

      // Send push notification
      await this.firebaseService.sendNotification({
        token: recipient.fcmToken,
        notification: {
          title: sender.name,
          body: truncatedContent,
        },
        data: {
          type: "CHAT_MESSAGE",
          sessionId: sessionId.toString(),
          senderId: senderId.toString(),
          messageId: messageId.toString(),
          clickAction: "CHAT_MESSAGE_CLICK",
        },
      });

      this.logger.log(
        `Push notification sent to user ${recipientId} for message ${messageId}`,
      );
    } catch (error) {
      // Log error but don't throw - push notification failure shouldn't block message sending
      this.logger.error(
        `Failed to send push notification to user ${recipientId}:`,
        error.message,
      );
    }
  }
}
