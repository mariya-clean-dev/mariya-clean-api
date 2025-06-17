import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  IsBoolean,
} from 'class-validator';

export class GetPriceEstimateDto {
  @IsString()
  @IsNotEmpty()
  service_id: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  no_of_rooms: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  no_of_bathrooms: number;

  @IsNumber()
  @IsNotEmpty()
  square_feet: number;

  @IsString()
  @IsOptional()
  subcription_type_id?: string;

  @IsBoolean()
  @IsOptional()
  isEcoCleaning?: boolean = false;

  @IsBoolean()
  @IsOptional()
  materialsProvidedByClient?: boolean = false;
}
