import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { AssignStaffZoneDto } from './dto/assign-staff-zone.dto';
import { CreatePincodeDto } from './dto/create-pincode.dto';

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createZoneDto: CreateZoneDto) {
    // Check if zone code already exists
    const existingZone = await this.prisma.zone.findUnique({
      where: { code: createZoneDto.code },
    });

    if (existingZone) {
      throw new ConflictException(
        `Zone with code ${createZoneDto.code} already exists`,
      );
    }

    return this.prisma.zone.create({
      data: {
        name: createZoneDto.name,
        code: createZoneDto.code,
        isActive: createZoneDto.isActive ?? true,
      },
    });
  }

  async findAll(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true, deletedAt: null };

    return this.prisma.zone.findMany({
      where,
      include: {
        _count: {
          select: {
            pincodes: true,
            staff: true,
            bookings: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      include: {
        pincodes: {
          where: { isActive: true, deletedAt: null },
        },
        staff: {
          include: {
            staff: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                status: true,
              },
            },
          },
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    if (!zone) {
      throw new NotFoundException(`Zone with ID ${id} not found`);
    }

    return zone;
  }

  async update(id: string, updateZoneDto: UpdateZoneDto) {
    await this.findOne(id);

    // If updating code, check for conflicts
    if (updateZoneDto.code) {
      const existingZone = await this.prisma.zone.findFirst({
        where: {
          code: updateZoneDto.code,
          id: { not: id },
        },
      });

      if (existingZone) {
        throw new ConflictException(
          `Zone with code ${updateZoneDto.code} already exists`,
        );
      }
    }

    return this.prisma.zone.update({
      where: { id },
      data: updateZoneDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // Soft delete
    return this.prisma.zone.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }

  async assignStaffToZone(assignStaffZoneDto: AssignStaffZoneDto) {
    const { staffId, zoneId } = assignStaffZoneDto;

    // Validate zone exists
    await this.findOne(zoneId);

    // Validate staff exists and has staff role
    const staff = await this.prisma.user.findFirst({
      where: {
        id: staffId,
        role: { name: 'staff' },
      },
    });

    if (!staff) {
      throw new NotFoundException(
        `Staff with ID ${staffId} not found or user is not a staff member`,
      );
    }

    // Check if staff already has a zone assignment
    const existingAssignment = await this.prisma.staffZone.findUnique({
      where: { staffId },
    });

    if (existingAssignment) {
      // Update existing assignment
      return this.prisma.staffZone.update({
        where: { staffId },
        data: { zoneId },
      });
    }

    // Create new assignment
    return this.prisma.staffZone.create({
      data: {
        staffId,
        zoneId,
      },
    });
  }

  async createPincode(createPincodeDto: CreatePincodeDto) {
    const { code, zoneId, isActive } = createPincodeDto;

    // Validate zone exists
    await this.findOne(zoneId);

    // Check if pincode already exists
    const existingPincode = await this.prisma.pincode.findUnique({
      where: { code },
    });

    if (existingPincode) {
      throw new ConflictException(`Pincode ${code} already exists`);
    }

    return this.prisma.pincode.create({
      data: {
        code,
        zoneId,
        isActive: isActive ?? true,
      },
    });
  }

  async deletePincode(code: string) {
    // Check if pincode exists
    const pincode = await this.prisma.pincode.findUnique({
      where: { code },
    });

    if (!pincode) {
      throw new NotFoundException(`Pincode ${code} not found`);
    }

    // Soft delete by setting deletedAt and isActive to false
    await this.prisma.pincode.update({
      where: { code },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return {
      message: `Pincode ${code} has been successfully removed`,
      code,
    };
  }

  async getPincodes(zoneId?: string) {
    const where: any = {
      isActive: true,
      deletedAt: null,
    };

    if (zoneId) {
      where.zoneId = zoneId;
    }

    return this.prisma.pincode.findMany({
      where,
      include: {
        zone: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  async checkPincode(pincode: string) {
    const pincodeRecord = await this.prisma.pincode.findFirst({
      where: {
        code: pincode,
        isActive: true,
      },
      include: {
        zone: {
          where: {
            isActive: true,
          },
        },
      },
    });

    if (!pincodeRecord || !pincodeRecord.zone) {
      return {
        serviced: false,
        message: `Pincode ${pincode} is not currently serviced`,
      };
    }

    return {
      serviced: true,
      zone: pincodeRecord.zone,
      message: `Pincode ${pincode} is serviced`,
    };
  }

  async getStaffInZone(zoneId: string) {
    await this.findOne(zoneId);

    const staffAssignments = await this.prisma.staffZone.findMany({
      where: { zoneId },
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            priority: true,
          },
        },
      },
    });

    return staffAssignments.map((assignment) => assignment.staff);
  }

  // Helper methods for use in other services
  async validatePincode(pincode: string) {
    const pincodeRecord = await this.prisma.pincode.findFirst({
      where: {
        code: pincode,
        isActive: true,
      },
      include: {
        zone: {
          where: {
            isActive: true,
          },
        },
      },
    });

    return pincodeRecord?.zone || null;
  }

  async getStaffZone(staffId: string) {
    const staffZone = await this.prisma.staffZone.findUnique({
      where: { staffId },
      include: {
        zone: true,
      },
    });

    // Check if zone is active
    if (staffZone?.zone && staffZone.zone.isActive && !staffZone.zone.deletedAt) {
      return staffZone.zone;
    }

    return null;
  }
}
