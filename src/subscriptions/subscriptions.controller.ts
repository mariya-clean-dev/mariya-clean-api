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
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('customer')
  create(@Body() createSubscriptionDto: CreateSubscriptionDto, @Request() req) {
    return this.subscriptionsService.create(createSubscriptionDto, req.user.id);
  }

  @Get()
  findAll(@Request() req) {
    // Admin sees all subscriptions, other users see only their own
    const userId = req.user.role === 'admin' ? undefined : req.user.id;
    return this.subscriptionsService.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    // Admin can view any subscription, other users only their own
    const userId = req.user.role === 'admin' ? undefined : req.user.id;
    return this.subscriptionsService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
    @Request() req,
  ) {
    // Admin can update any subscription, other users only their own
    const userId = req.user.role === 'admin' ? undefined : req.user.id;
    return this.subscriptionsService.update(id, updateSubscriptionDto, userId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.subscriptionsService.remove(id);
  }

  @Post(':id/pause')
  @UseGuards(RolesGuard)
  @Roles('customer')
  pause(@Param('id') id: string, @Request() req) {
    return this.subscriptionsService.pause(id, req.user.id);
  }

  @Post(':id/resume')
  @UseGuards(RolesGuard)
  @Roles('customer')
  resume(@Param('id') id: string, @Request() req) {
    return this.subscriptionsService.resume(id, req.user.id);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles('customer')
  cancel(
    @Param('id') id: string,
    @Body() cancelSubscriptionDto: CancelSubscriptionDto,
    @Request() req,
  ) {
    return this.subscriptionsService.cancel(
      id,
      req.user.id,
      cancelSubscriptionDto.reason,
    );
  }
}
