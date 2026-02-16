import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateFcmTokenDto {
    @IsString()
    @IsOptional()
    userid?: string;

    @IsString()
    @IsNotEmpty()
    fcmToken: string;
}
