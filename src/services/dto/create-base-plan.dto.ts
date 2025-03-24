import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateBasePlanDto {
  @IsString()
  @IsNotEmpty()
  regionId: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  minimumArea: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  maximumArea: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  price: number;

  @IsString()
  @IsOptional()
  currency?: string = 'USD';
}
