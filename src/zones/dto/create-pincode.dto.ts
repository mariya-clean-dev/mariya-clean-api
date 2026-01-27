import { IsString, IsNotEmpty, IsBoolean, IsOptional, Matches } from 'class-validator';

export class CreatePincodeDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{5}(-\d{4})?$/, {
    message: 'Pincode must be a valid US ZIP code (e.g., 12345 or 12345-6789)',
  })
  code: string;

  @IsString()
  @IsNotEmpty()
  zoneId: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
