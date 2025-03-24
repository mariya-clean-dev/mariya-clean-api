import { IsString, IsNotEmpty } from 'class-validator';

export class AssignStaffDto {
  @IsString()
  @IsNotEmpty()
  staffId: string;
}
