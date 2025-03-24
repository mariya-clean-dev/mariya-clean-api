import { IsNotEmpty, IsNumber, IsEnum, Min } from 'class-validator';
import { PriceType } from '@prisma/client';

export class CreatePriceChartDto {
  @IsEnum(PriceType)
  @IsNotEmpty()
  priceType: PriceType;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  price: number;
}

