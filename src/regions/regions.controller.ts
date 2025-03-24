import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { RegionsService } from './regions.service';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  create(@Body() createRegionDto: CreateRegionDto) {
    return this.regionsService.create(createRegionDto);
  }

  @Get()
  @Public()
  findAll() {
    return this.regionsService.findAll();
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.regionsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() updateRegionDto: UpdateRegionDto) {
    return this.regionsService.update(id, updateRegionDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.regionsService.remove(id);
  }

  @Post('assign-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  assignUserToRegion(
    @Query('userId') userId: string,
    @Query('regionId') regionId: string,
  ) {
    return this.regionsService.assignUserToRegion(userId, regionId);
  }

  @Delete('remove-user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  removeUserFromRegion(
    @Query('userId') userId: string,
    @Query('regionId') regionId: string,
  ) {
    return this.regionsService.removeUserFromRegion(userId, regionId);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  getUserRegions(@Param('userId') userId: string) {
    return this.regionsService.getUserRegions(userId);
  }
}
