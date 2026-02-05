import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MarkMessagesReadDto {
    @ApiProperty({ description: 'Array of message IDs to mark as read' })
    @IsArray()
    @IsUUID('4', { each: true })
    messageIds: string[];
}
