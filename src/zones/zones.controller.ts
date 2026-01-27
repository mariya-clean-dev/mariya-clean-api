import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ZonesService } from './zones.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { AssignStaffZoneDto } from './dto/assign-staff-zone.dto';
import { CreatePincodeDto } from './dto/create-pincode.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('zones')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Post()
  @Roles('admin')
  create(@Body() createZoneDto: CreateZoneDto) {
    return this.zonesService.create(createZoneDto);
  }

  @Get()
  @Roles('admin', 'staff')
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.zonesService.findAll(includeInactive === 'true');
  }

  @Get('check-pincode/:pincode')
  checkPincode(@Param('pincode') pincode: string) {
    return this.zonesService.checkPincode(pincode);
  }

  @Get(':id')
  @Roles('admin', 'staff')
  findOne(@Param('id') id: string) {
    return this.zonesService.findOne(id);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() updateZoneDto: UpdateZoneDto) {
    return this.zonesService.update(id, updateZoneDto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.zonesService.remove(id);
  }

  @Post('staff')
  @Roles('admin')
  assignStaffToZone(@Body() assignStaffZoneDto: AssignStaffZoneDto) {
    return this.zonesService.assignStaffToZone(assignStaffZoneDto);
  }

  @Post('pincodes')
  @Roles('admin')
  createPincode(@Body() createPincodeDto: CreatePincodeDto) {
    return this.zonesService.createPincode(createPincodeDto);
  }

  @Get('pincodes/list')
  @Roles('admin', 'staff')
  getPincodes(@Query('zoneId') zoneId?: string) {
    return this.zonesService.getPincodes(zoneId);
  }

  @Get(':id/staff')
  @Roles('admin', 'staff')
  getStaffInZone(@Param('id') id: string) {
    return this.zonesService.getStaffInZone(id);
  }
}
