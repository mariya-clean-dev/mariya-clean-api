import { IsString, IsEnum, IsNumber, IsOptional, IsBoolean, IsDateString, Min, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FLAT_AMOUNT = 'flat_amount',
}

export class CreateCouponDto {
  @ApiProperty({ 
    description: 'Unique coupon code (auto-converted to uppercase)', 
    example: 'WELCOME20',
    required: true 
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.toUpperCase())
  code: string;

  @ApiProperty({ 
    description: 'Human-readable description of the coupon', 
    example: '20% discount for new customers',
    required: false 
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ 
    description: 'Type of discount', 
    enum: DiscountType,
    example: DiscountType.PERCENTAGE,
    required: true 
  })
  @IsEnum(DiscountType)
  @IsNotEmpty()
  discountType: DiscountType;

  @ApiProperty({ 
    description: 'Discount value (percentage: 0-100, flat: amount in currency)', 
    example: 20,
    minimum: 0,
    required: true 
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  discountValue: number;

  @ApiProperty({ 
    description: 'Minimum booking amount required to apply coupon', 
    example: 100,
    minimum: 0,
    required: false 
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minimumAmount?: number;

  @ApiProperty({ 
    description: 'Maximum number of times the coupon can be used in total', 
    example: 100,
    minimum: 1,
    required: false 
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  maxUsageCount?: number;

  @ApiProperty({ 
    description: 'Maximum number of times a single user can use the coupon', 
    example: 1,
    minimum: 1,
    required: false 
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  maxUsagePerUser?: number;

  @ApiProperty({ 
    description: 'Date from which the coupon becomes valid', 
    example: '2026-02-01T00:00:00Z',
    required: false 
  })
  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @ApiProperty({ 
    description: 'Date after which the coupon expires', 
    example: '2026-12-31T23:59:59Z',
    required: false 
  })
  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @ApiProperty({ 
    description: 'Whether the coupon is active and can be used', 
    example: true,
    default: true,
    required: false 
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
