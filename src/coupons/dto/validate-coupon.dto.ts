import { IsString, IsNumber, IsNotEmpty, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateCouponDto {
  @ApiProperty({ 
    description: 'Coupon code to validate', 
    example: 'WELCOME20',
    required: true 
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ 
    description: 'Total booking amount before discount', 
    example: 250.00,
    minimum: 0,
    required: true 
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  bookingAmount: number;
}
