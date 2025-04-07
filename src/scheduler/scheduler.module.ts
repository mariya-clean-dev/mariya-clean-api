import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ResponseModule } from 'src/response/response.module';

@Module({
  imports: [PrismaModule, ResponseModule],
  controllers: [SchedulerController],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
