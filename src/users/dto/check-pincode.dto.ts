import { IsEmail, IsString, IsNotEmpty, Matches } from 'class-validator';

export class CheckPincodeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  pincode: string;
}
