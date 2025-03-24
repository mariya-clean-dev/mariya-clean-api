import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createRegionDto: CreateRegionDto) {
    return this.prisma.region.create({
      data: createRegionDto,
    });
  }

  async findAll() {
    return this.prisma.region.findMany();
  }

  async findOne(id: string) {
    const region = await this.prisma.region.findUnique({
      where: { id },
    });

    if (!region) {
      throw new NotFoundException(`Region with ID ${id} not found`);
    }

    return region;
  }

  async update(id: string, updateRegionDto: UpdateRegionDto) {
    // Check if region exists
    await this.findOne(id);

    return this.prisma.region.update({
      where: { id },
      data: updateRegionDto,
    });
  }

  async remove(id: string) {
    // Check if region exists
    await this.findOne(id);

    return this.prisma.region.delete({
      where: { id },
    });
  }

  async assignUserToRegion(userId: string, regionId: string) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Check if region exists
    await this.findOne(regionId);

    // Check if assignment already exists
    const existingAssignment = await this.prisma.userRegion.findFirst({
      where: {
        userId,
        regionId,
      },
    });

    if (existingAssignment) {
      return existingAssignment;
    }

    // Create assignment
    return this.prisma.userRegion.create({
      data: {
        userId,
        regionId,
      },
    });
  }

  async removeUserFromRegion(userId: string, regionId: string) {
    // Check if assignment exists
    const assignment = await this.prisma.userRegion.findFirst({
      where: {
        userId,
        regionId,
      },
    });

    if (!assignment) {
      throw new NotFoundException(
        `User with ID ${userId} is not assigned to region with ID ${regionId}`,
      );
    }

    // Delete assignment
    return this.prisma.userRegion.delete({
      where: {
        id: assignment.id,
      },
    });
  }

  async getUserRegions(userId: string) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Get user's regions
    const userRegions = await this.prisma.userRegion.findMany({
      where: { userId },
      include: {
        region: true,
      },
    });

    return userRegions.map((ur) => ur.region);
  }
}
