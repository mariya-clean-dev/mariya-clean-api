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
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@ApiTags('Coupons')
@ApiBearerAuth()
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new coupon', description: 'Admin only: Create a new coupon code with discount rules and usage limits' })
  @ApiResponse({ status: 201, description: 'Coupon created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data or duplicate coupon code' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Body() createCouponDto: CreateCouponDto) {
    return this.couponsService.create(createCouponDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all coupons', description: 'Retrieve all coupons with optional filtering and pagination' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number for pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Coupons retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: any = {};
    
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    
    if (page) {
      filters.page = parseInt(page, 10);
    }
    
    if (limit) {
      filters.limit = parseInt(limit, 10);
    }
    
    return this.couponsService.findAll(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get coupon by ID', description: 'Retrieve detailed information about a specific coupon' })
  @ApiParam({ name: 'id', description: 'Coupon UUID' })
  @ApiResponse({ status: 200, description: 'Coupon found' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findOne(@Param('id') id: string) {
    return this.couponsService.findOne(id);
  }

  @Post('validate')
  @ApiOperation({ 
    summary: 'Validate coupon code', 
    description: 'Validate if a coupon can be applied to a booking. Checks all validation rules and returns discount calculation.' 
  })
  @ApiResponse({ status: 200, description: 'Coupon validated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid coupon or validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async validate(
    @Body() validateCouponDto: ValidateCouponDto,
    @Request() req?: any,
  ) {
    // Extract userId from request if authenticated
    // For now, using a placeholder - this should be integrated with auth
    const userId = req?.user?.id || 'guest';
    
    return this.couponsService.validateCoupon(
      validateCouponDto.code,
      userId,
      validateCouponDto.bookingAmount,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update coupon', description: 'Admin only: Update coupon details. All fields are optional.' })
  @ApiParam({ name: 'id', description: 'Coupon UUID' })
  @ApiResponse({ status: 200, description: 'Coupon updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid update data or duplicate code' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(@Param('id') id: string, @Body() updateCouponDto: UpdateCouponDto) {
    return this.couponsService.update(id, updateCouponDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete coupon', description: 'Admin only: Soft delete a coupon by deactivating it. The coupon record is preserved for historical tracking.' })
  @ApiParam({ name: 'id', description: 'Coupon UUID' })
  @ApiResponse({ status: 200, description: 'Coupon deleted successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  remove(@Param('id') id: string) {
    return this.couponsService.remove(id);
  }
}
