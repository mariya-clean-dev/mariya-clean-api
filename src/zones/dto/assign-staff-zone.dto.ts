import { IsString, IsNotEmpty } from 'class-validator';

export class AssignStaffZoneDto {
  @IsString()
  @IsNotEmpty()
  staffId: string;

  @IsString()
  @IsNotEmpty()
  zoneId: string;
}
