import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
} from 'class-validator';

export class GetPriceEstimateDto {
  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  areaSize: number;

  @IsString()
  @IsNotEmpty()
  regionId: string;

  @IsArray()
  @IsOptional()
  addOnIds?: string[] = [];
}

