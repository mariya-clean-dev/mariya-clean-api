import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class OtpVerifyDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  otp: string;
}
