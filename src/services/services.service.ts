import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PriceType } from '@prisma/client';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createServiceDto: CreateServiceDto) {
    // Extract category IDs if provided
    const { categoryIds, ...serviceData } = createServiceDto;

    // Create service with categories if provided
    return this.prisma.service.create({
      data: {
        ...serviceData,
        // ...(categoryIds && {
        //   categories: {
        //     create: categoryIds.map((categoryId) => ({
        //       category: {
        //         connect: { id: categoryId },
        //       },
        //     })),
        //   },
        // }),
      },
      include: {
        // categories: {
        //   include: {
        //     category: true,
        //   },
        // },
      },
    });
  }

  async findAll(includeInactive = false) {
    return this.prisma.service.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        // categories: {
        //   include: {
        //     category: true,
        //   },
        // },
        // basePlans: true,
        // priceCharts: true,
        serviceAddOns: true,
      },
    });
  }

  async findOne(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        // categories: {
        //   include: {
        //     category: true,
        //   },
        // },
        // basePlans: true,
        // priceCharts: true,
        serviceAddOns: true,
      },
    });

    if (!service) {
      throw new NotFoundException(`Service with ID ${id} not found`);
    }

    return service;
  }

  // async update(id: string, updateServiceDto: UpdateServiceDto) {
  //   // Check if service exists
  //   await this.findOne(id);

  //   // Extract category IDs if provided
  //   const { categoryIds, ...serviceData } = updateServiceDto;

  //   // If categories are provided, update them
  //   if (categoryIds) {
  //     // Delete existing mappings
  //     await this.prisma.serviceCategoryMapping.deleteMany({
  //       where: { serviceId: id },
  //     });

  //     // Create new mappings
  //     await Promise.all(
  //       categoryIds.map((categoryId) =>
  //         this.prisma.serviceCategoryMapping.create({
  //           data: {
  //             service: { connect: { id } },
  //             category: { connect: { id: categoryId } },
  //           },
  //         }),
  //       ),
  //     );
  //   }

  //   // Update service
  //   return this.prisma.service.update({
  //     where: { id },
  //     data: serviceData,
  //     include: {
  //       // categories: {
  //       //   include: {
  //       //     category: true,
  //       //   },
  //       // },
  //       // basePlans: true,
  //       // priceCharts: true,
  //       serviceAddOns: true,
  //     },
  //   });
  // }

  async remove(id: string) {
    // Check if service exists
    await this.findOne(id);

    // Delete service
    return this.prisma.service.delete({
      where: { id },
    });
  }

  // async addPriceChart(serviceId: string, priceType: PriceType, price: number) {
  //   // Check if service exists
  //   await this.findOne(serviceId);

  //   // Add price chart
  //   return this.prisma.priceChart.create({
  //     data: {
  //       service: { connect: { id: serviceId } },
  //       priceType,
  //       price,
  //     },
  //   });
  // }

  // async addBasePlan(
  //   serviceId: string,
  //   regionId: string,
  //   minimumArea: number,
  //   maximumArea: number,
  //   price: number,
  //   currency: string = 'USD',
  // ) {
  //   // Check if service exists
  //   await this.findOne(serviceId);

  //   // Check if region exists
  //   const region = await this.prisma.region.findUnique({
  //     where: { id: regionId },
  //   });

  //   if (!region) {
  //     throw new NotFoundException(`Region with ID ${regionId} not found`);
  //   }

  //   // Check if there's overlap with existing plans
  //   const existingPlan = await this.prisma.basePlan.findFirst({
  //     where: {
  //       serviceId,
  //       regionId,
  //       OR: [
  //         {
  //           minimumArea: { lte: minimumArea },
  //           maximumArea: { gte: minimumArea },
  //         },
  //         {
  //           minimumArea: { lte: maximumArea },
  //           maximumArea: { gte: maximumArea },
  //         },
  //         {
  //           minimumArea: { gte: minimumArea },
  //           maximumArea: { lte: maximumArea },
  //         },
  //       ],
  //     },
  //   });

  //   if (existingPlan) {
  //     throw new BadRequestException(
  //       `There's an overlapping base plan for this service and region`,
  //     );
  //   }

  //   // Add base plan
  //   return this.prisma.basePlan.create({
  //     data: {
  //       service: { connect: { id: serviceId } },
  //       region: { connect: { id: regionId } },
  //       minimumArea,
  //       maximumArea,
  //       price,
  //       currency,
  //     },
  //   });
  // }

  async addServiceAddOn(
    serviceId: string,
    name: string,
    description: string,
    price: number,
  ) {
    // Check if service exists
    await this.findOne(serviceId);

    // Add service add-on
    return this.prisma.serviceAddOn.create({
      data: {
        service: { connect: { id: serviceId } },
        name,
        description,
        price,
      },
    });
  }

  async getPriceEstimate(
    serviceId: string,
    square_feet: number,
    no_of_rooms: number,
    no_of_bathrooms: number,
  ) {
    // Step 1: Get service info
    const service = await this.findOne(serviceId);
    const base_price = Number(service.base_price);
    const price_per_sqft = Number(service.square_foot_price);
    const price_per_room = Number(service.room_rate);
    const price_per_bathroom = Number(service.bathroom_rate);

    // Step 2: Calculate base price (without any subscription adjustments)
    const baseCalculatedPrice =
      base_price +
      ((square_feet - 1000) / 500) * price_per_sqft +
      (no_of_rooms - 1) * price_per_room +
      (no_of_bathrooms - 1) * price_per_bathroom;

    // Step 3: Get subscription types
    const subscriptionTypes = await this.prisma.subscriptionType.findMany();

    // Step 4: Loop through each subscription type and calculate the adjusted price
    let estimates = subscriptionTypes.map((sub) => {
      // For example, assume each subscription type has a discountPercent
      const discountPercent = Number(sub.available_discount || 0); // fallback to 0 if null
      const planprice = baseCalculatedPrice * Number(sub.recurringFrequency);
      const discountedPrice = planprice - (planprice * discountPercent) / 100;

      return {
        subscriptionTypeId: sub.id,
        subscriptionName: sub.name,
        description: sub.description,
        discountPercent,
        finalPrice: Math.max(discountedPrice, 0), // prevent negative
      };
    });

    const onetimeEstimate = {
      subscriptionTypeId: null,
      subscriptionName: 'One Time Cleaning',
      description: 'A Single time Cleaning Service',
      discountPercent: 0,
      finalPrice: baseCalculatedPrice, // prevent negative
    };

    estimates.push(onetimeEstimate);

    return {
      baseCalculatedPrice,
      estimates,
    };
  }

  // async getCategories() {
  //   return this.prisma.serviceCategory.findMany();
  // }

  // async createCategory(name: string, description?: string) {
  //   return this.prisma.serviceCategory.create({
  //     data: {
  //       name,
  //       description,
  //     },
  //   });
  // }

  // async updateCategory(id: string, name?: string, description?: string) {
  //   const category = await this.prisma.serviceCategory.findUnique({
  //     where: { id },
  //   });

  //   if (!category) {
  //     throw new NotFoundException(`Category with ID ${id} not found`);
  //   }

  //   return this.prisma.serviceCategory.update({
  //     where: { id },
  //     data: {
  //       ...(name && { name }),
  //       ...(description !== undefined && { description }),
  //     },
  //   });
  // }

  // async removeCategory(id: string) {
  //   const category = await this.prisma.serviceCategory.findUnique({
  //     where: { id },
  //   });

  //   if (!category) {
  //     throw new NotFoundException(`Category with ID ${id} not found`);
  //   }

  //   return this.prisma.serviceCategory.delete({
  //     where: { id },
  //   });
  // }
}
