import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    UseGuards,
    Request,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';
import { GetSessionsDto } from './dto/get-sessions.dto';
import { GetMessagesDto } from './dto/get-messages.dto';
import { MarkMessagesReadDto } from './dto/mark-read.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
    constructor(private readonly chatService: ChatService) { }

    @Get('sessions')
    @ApiOperation({ summary: 'Get all chat sessions for the authenticated user' })
    async getSessions(
        @Request() req,
        @Query() query: GetSessionsDto,
    ) {
        return this.chatService.getUserSessions(
            req.user.id,
            query.page,
            query.limit,
        );
    }

    @Get('sessions/:sessionId/messages')
    @ApiOperation({ summary: 'Get messages for a specific chat session' })
    async getSessionMessages(
        @Request() req,
        @Param('sessionId') sessionId: string,
        @Query() query: GetMessagesDto,
    ) {
        return this.chatService.getSessionMessages(
            sessionId,
            req.user.id,
            query.page,
            query.limit,
        );
    }

    @Post('messages')
    @ApiOperation({ summary: 'Send a message (REST fallback)' })
    async sendMessage(
        @Request() req,
        @Body() dto: SendMessageDto,
    ) {
        const message = await this.chatService.sendMessage(req.user.id, dto);
        const session = await this.chatService.getOrCreateSession(req.user.id, dto.recipientId);
        
        return {
            ...message,
            sessionId: session.id,
        };
    }

    @Post('messages/read')
    @ApiOperation({ summary: 'Mark messages as read' })
    async markMessagesAsRead(
        @Request() req,
        @Body() dto: MarkMessagesReadDto,
    ) {
        return this.chatService.markMessagesAsRead(req.user.id, dto.messageIds);
    }

    @Get('unread-count')
    @ApiOperation({ summary: 'Get unread message count for the authenticated user' })
    async getUnreadCount(@Request() req) {
        return this.chatService.getUnreadCount(req.user.id);
    }

    @Get('session/:otherUserId')
    @ApiOperation({ summary: 'Get or create a chat session with another user' })
    async getOrCreateSession(
        @Request() req,
        @Param('otherUserId') otherUserId: string,
    ) {
        return this.chatService.getOrCreateSession(req.user.id, otherUserId);
    }
}
