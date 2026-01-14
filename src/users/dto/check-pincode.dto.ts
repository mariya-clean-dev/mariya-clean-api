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
  @Matches(/^\d{5}(-\d{4})?$/, {
    message: 'Pincode must be a valid US ZIP code (e.g., 12345 or 12345-6789)',
  })
  pincode: string;
}
