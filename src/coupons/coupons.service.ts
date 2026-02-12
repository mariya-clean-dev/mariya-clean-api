import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCouponDto: CreateCouponDto) {
    // Check if coupon code already exists
    const existing = await this.prisma.coupon.findUnique({
      where: { code: createCouponDto.code.toUpperCase() },
    });

    if (existing) {
      throw new BadRequestException(
        `Coupon code ${createCouponDto.code} already exists`,
      );
    }

    // Validate discount value based on type
    if (createCouponDto.discountType === 'percentage') {
      if (createCouponDto.discountValue > 100) {
        throw new BadRequestException(
          'Percentage discount cannot exceed 100%',
        );
      }
    }

    // Validate date range
    if (createCouponDto.validFrom && createCouponDto.validUntil) {
      const from = new Date(createCouponDto.validFrom);
      const until = new Date(createCouponDto.validUntil);
      if (from >= until) {
        throw new BadRequestException(
          'validFrom must be before validUntil',
        );
      }
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        code: createCouponDto.code.toUpperCase(),
        description: createCouponDto.description,
        discountType: createCouponDto.discountType,
        discountValue: new Prisma.Decimal(createCouponDto.discountValue),
        minimumAmount: createCouponDto.minimumAmount
          ? new Prisma.Decimal(createCouponDto.minimumAmount)
          : null,
        maxUsageCount: createCouponDto.maxUsageCount,
        maxUsagePerUser: createCouponDto.maxUsagePerUser,
        validFrom: createCouponDto.validFrom
          ? new Date(createCouponDto.validFrom)
          : null,
        validUntil: createCouponDto.validUntil
          ? new Date(createCouponDto.validUntil)
          : null,
        isActive: createCouponDto.isActive ?? true,
      },
    });

    return coupon;
  }

  async findAll(filters?: {
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const [coupons, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { couponUsages: true },
          },
        },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return {
      data: coupons,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        _count: {
          select: { couponUsages: true },
        },
      },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with ID ${id} not found`);
    }

    return coupon;
  }

  async findByCode(code: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon code ${code} not found`);
    }

    return coupon;
  }

  async update(id: string, updateCouponDto: UpdateCouponDto) {
    await this.findOne(id); // Check if exists

    // Validate discount value based on type if provided
    if (
      updateCouponDto.discountType === 'percentage' &&
      updateCouponDto.discountValue !== undefined &&
      updateCouponDto.discountValue > 100
    ) {
      throw new BadRequestException('Percentage discount cannot exceed 100%');
    }

    const updateData: any = {};
    
    if (updateCouponDto.code) {
      updateData.code = updateCouponDto.code.toUpperCase();
    }
    if (updateCouponDto.description !== undefined) {
      updateData.description = updateCouponDto.description;
    }
    if (updateCouponDto.discountType) {
      updateData.discountType = updateCouponDto.discountType;
    }
    if (updateCouponDto.discountValue !== undefined) {
      updateData.discountValue = new Prisma.Decimal(updateCouponDto.discountValue);
    }
    if (updateCouponDto.minimumAmount !== undefined) {
      updateData.minimumAmount = updateCouponDto.minimumAmount
        ? new Prisma.Decimal(updateCouponDto.minimumAmount)
        : null;
    }
    if (updateCouponDto.maxUsageCount !== undefined) {
      updateData.maxUsageCount = updateCouponDto.maxUsageCount;
    }
    if (updateCouponDto.maxUsagePerUser !== undefined) {
      updateData.maxUsagePerUser = updateCouponDto.maxUsagePerUser;
    }
    if (updateCouponDto.validFrom !== undefined) {
      updateData.validFrom = updateCouponDto.validFrom
        ? new Date(updateCouponDto.validFrom)
        : null;
    }
    if (updateCouponDto.validUntil !== undefined) {
      updateData.validUntil = updateCouponDto.validUntil
        ? new Date(updateCouponDto.validUntil)
        : null;
    }
    if (updateCouponDto.isActive !== undefined) {
      updateData.isActive = updateCouponDto.isActive;
    }

    const coupon = await this.prisma.coupon.update({
      where: { id },
      data: updateData,
    });

    return coupon;
  }

  async remove(id: string) {
    await this.findOne(id); // Check if exists

    // Soft delete by deactivating
    const coupon = await this.prisma.coupon.update({
      where: { id },
      data: { isActive: false },
    });

    return coupon;
  }

  async validateCoupon(code: string, userId: string, bookingAmount: number) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon) {
      throw new BadRequestException(`Coupon code ${code} does not exist`);
    }

    if (!coupon.isActive) {
      throw new BadRequestException(`Coupon code ${code} is not active`);
    }

    // Check validity dates
    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      throw new BadRequestException(
        `Coupon code ${code} is not yet valid. Valid from ${coupon.validFrom.toLocaleDateString()}`,
      );
    }

    if (coupon.validUntil && now > coupon.validUntil) {
      throw new BadRequestException(
        `Coupon code ${code} has expired. Valid until ${coupon.validUntil.toLocaleDateString()}`,
      );
    }

    // Check minimum amount requirement
    if (coupon.minimumAmount) {
      const minAmount = parseFloat(coupon.minimumAmount.toString());
      if (bookingAmount < minAmount) {
        throw new BadRequestException(
          `Minimum booking amount of $${minAmount} required to use this coupon. Your booking amount: $${bookingAmount}`,
        );
      }
    }

    // Check max usage count
    if (coupon.maxUsageCount) {
      const usageCount = await this.prisma.couponUsage.count({
        where: { couponId: coupon.id },
      });

      if (usageCount >= coupon.maxUsageCount) {
        throw new BadRequestException(
          `Coupon code ${code} has reached its maximum usage limit`,
        );
      }
    }

    // Check user-specific usage limit
    if (coupon.maxUsagePerUser) {
      const userUsageCount = await this.prisma.couponUsage.count({
        where: {
          couponId: coupon.id,
          userId,
        },
      });

      if (userUsageCount >= coupon.maxUsagePerUser) {
        throw new BadRequestException(
          `You have already used this coupon the maximum number of times (${coupon.maxUsagePerUser})`,
        );
      }
    }

    // Calculate discount
    const discountAmount = this.calculateDiscount(coupon, bookingAmount);

    return {
      valid: true,
      coupon,
      discountAmount,
      finalAmount: bookingAmount - discountAmount,
    };
  }

  calculateDiscount(
    coupon: { discountType: any; discountValue: any },
    bookingAmount: number,
  ): number {
    let discount = 0;

    if (coupon.discountType === 'percentage') {
      const percentage = parseFloat(coupon.discountValue.toString());
      discount = (bookingAmount * percentage) / 100;
    } else if (coupon.discountType === 'flat_amount') {
      discount = parseFloat(coupon.discountValue.toString());
    }

    // Ensure discount doesn't exceed booking amount
    discount = Math.min(discount, bookingAmount);

    // Round to 2 decimal places
    return Math.round(discount * 100) / 100;
  }

  async recordUsage(
    couponId: string,
    userId: string,
    bookingId: string,
    discountAmount: number,
  ) {
    const usage = await this.prisma.couponUsage.create({
      data: {
        couponId,
        userId,
        bookingId,
        discountAmount: new Prisma.Decimal(discountAmount),
      },
    });

    return usage;
  }
}
