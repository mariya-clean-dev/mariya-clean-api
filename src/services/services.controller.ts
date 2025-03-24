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
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CreatePriceChartDto } from './dto/create-price-chart.dto';
import { CreateBasePlanDto } from './dto/create-base-plan.dto';
import { CreateServiceAddOnDto } from './dto/create-service-add-on.dto';
import { GetPriceEstimateDto } from './dto/get-price-estimate.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  create(@Body() createServiceDto: CreateServiceDto) {
    return this.servicesService.create(createServiceDto);
  }

  @Get()
  @Public()
  findAll(@Query('includeInactive') includeInactive: boolean = false) {
    return this.servicesService.findAll(includeInactive);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() updateServiceDto: UpdateServiceDto) {
    return this.servicesService.update(id, updateServiceDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.servicesService.remove(id);
  }

  @Post(':id/price-chart')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  addPriceChart(
    @Param('id') id: string,
    @Body() createPriceChartDto: CreatePriceChartDto,
  ) {
    return this.servicesService.addPriceChart(
      id,
      createPriceChartDto.priceType,
      createPriceChartDto.price,
    );
  }

  @Post(':id/base-plan')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  addBasePlan(
    @Param('id') id: string,
    @Body() createBasePlanDto: CreateBasePlanDto,
  ) {
    return this.servicesService.addBasePlan(
      id,
      createBasePlanDto.regionId,
      createBasePlanDto.minimumArea,
      createBasePlanDto.maximumArea,
      createBasePlanDto.price,
      createBasePlanDto.currency,
    );
  }

  @Post(':id/add-on')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  addServiceAddOn(
    @Param('id') id: string,
    @Body() createServiceAddOnDto: CreateServiceAddOnDto,
  ) {
    return this.servicesService.addServiceAddOn(
      id,
      createServiceAddOnDto.name,
      createServiceAddOnDto.description,
      createServiceAddOnDto.price,
    );
  }

  @Post('price-estimate')
  @Public()
  getPriceEstimate(@Body() getPriceEstimateDto: GetPriceEstimateDto) {
    return this.servicesService.getPriceEstimate(
      getPriceEstimateDto.serviceId,
      getPriceEstimateDto.areaSize,
      getPriceEstimateDto.regionId,
      getPriceEstimateDto.addOnIds,
    );
  }

  @Get('categories')
  @Public()
  getCategories() {
    return this.servicesService.getCategories();
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createCategory(@Body() createCategoryDto: CreateCategoryDto) {
    return this.servicesService.createCategory(
      createCategoryDto.name,
      createCategoryDto.description,
    );
  }

  @Patch('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateCategory(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.servicesService.updateCategory(
      id,
      updateCategoryDto.name,
      updateCategoryDto.description,
    );
  }

  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  removeCategory(@Param('id') id: string) {
    return this.servicesService.removeCategory(id);
  }
}
