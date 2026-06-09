import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
    imports: [
        PrismaModule,
        FirebaseModule,
        ConfigModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: {
                    expiresIn: configService.get<string>('JWT_EXPIRATION'),
                },
            }),
        }),
    ],
    controllers: [ChatController],
    providers: [ChatService, ChatGateway],
    exports: [ChatService, ChatGateway],
})
export class ChatModule { }
