import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
    @ApiProperty({ description: 'ID of the recipient user' })
    @IsUUID()
    @IsNotEmpty()
    recipientId: string;

    @ApiProperty({ description: 'Message content' })
    @IsString()
    @IsNotEmpty()
    content: string;
}
