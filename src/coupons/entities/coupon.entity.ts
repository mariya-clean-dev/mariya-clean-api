import { Coupon, DiscountType } from '@prisma/client';

export class CouponEntity implements Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: any; // Prisma Decimal
  minimumAmount: any | null; // Prisma Decimal
  maxUsageCount: number | null;
  maxUsagePerUser: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
