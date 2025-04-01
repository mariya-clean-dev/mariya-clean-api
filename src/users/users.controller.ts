import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { ResponseService } from 'src/response/response.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly responseService: ResponseService,
  ) {}

  @Post()
  @UseGuards(RolesGuard, JwtAuthGuard)
  @Roles('admin')
  async create(@Body() createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);
    return this.responseService.successResponse(
      'User Created Sucessfully',
      user,
    );
  }

  @Get()
  @UseGuards(RolesGuard, JwtAuthGuard)
  @Roles('admin')
  async findAll(@Query('role') role?: string) {
    if (role) {
      return this.usersService.findByRole(role);
    }
    const users = await this.usersService.findAll();
    return this.responseService.successResponse('Users Found', users);
  }

  @Get('roles')
  async getRoles(@Request() req) {
    const roles = await this.usersService.findallroles();
    return this.responseService.successResponse('Roles Found', roles);
  }

  @Get('staff')
  @UseGuards(RolesGuard, JwtAuthGuard)
  @Roles('admin')
  async findAllStaff() {
    const staff = await this.usersService.findByRole('staff');
    return this.responseService.successResponse('Staff Found', staff);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    const user = await this.usersService.findOne(req.user.id);
    return this.responseService.successResponse('User Profile', user);
  }

  @Get(':id')
  @UseGuards(RolesGuard, JwtAuthGuard)
  @Roles('admin')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(req.user.id, updateUserDto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard, JwtAuthGuard)
  @Roles('admin')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard, JwtAuthGuard)
  @Roles('admin')
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  // Address endpoints
  @Post('address')
  @UseGuards(JwtAuthGuard)
  async addAddress(@Request() req, @Body() createAddressDto: CreateAddressDto) {
    return this.usersService.addAddress(req.user.id, createAddressDto);
  }

  @Patch('address/:id')
  @UseGuards(JwtAuthGuard)
  async updateAddress(
    @Request() req,
    @Param('id') id: string,
    @Body() updateAddressDto: UpdateAddressDto,
  ) {
    return this.usersService.updateAddress(req.user.id, id, updateAddressDto);
  }

  @Delete('address/:id')
  @UseGuards(JwtAuthGuard)
  async removeAddress(@Request() req, @Param('id') id: string) {
    return this.usersService.removeAddress(req.user.id, id);
  }

  @Patch('address/:id/default')
  @UseGuards(JwtAuthGuard)
  async setDefaultAddress(@Request() req, @Param('id') id: string) {
    return this.usersService.setDefaultAddress(req.user.id, id);
  }
}
