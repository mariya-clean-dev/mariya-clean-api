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

  async update(id: string, updateServiceDto: UpdateServiceDto) {
    // Check if service exists
    await this.findOne(id);

    // Extract category IDs if provided
    const { categoryIds, ...serviceData } = updateServiceDto;

    // Update service
    return this.prisma.service.update({
      where: { id },
      data: serviceData,
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
    isEcoCleaning: boolean,
    materialsProvidedByClient: boolean,
  ) {
    // Fetch pricing parameters
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        base_price: true,
        square_foot_price: true,
        room_rate: true,
        bathroom_rate: true,
        durationMinutes: true,
      },
    });

    if (!service) {
      throw new Error('Service not found');
    }

    const base_price = Number(service.base_price); // e.g. ₹20
    const price_per_sqft = Number(service.square_foot_price); // e.g. ₹110
    const price_per_room = Number(service.room_rate); // e.g. ₹115
    const price_per_bathroom = Number(service.bathroom_rate); // e.g. ₹10

    // Normalize counts
    const roomCount = Math.max(0, no_of_rooms - 1); // First room included
    const bathCount = Math.max(0, no_of_bathrooms - 1); // First bathroom included
    const sqftMultiplier = Math.max(0, Math.ceil((square_feet - 1000) / 500)); // First 1000 sqft included

    // Base calculated price before any adjustments
    let baseCalculatedPrice =
      base_price +
      sqftMultiplier * price_per_sqft +
      roomCount * price_per_room +
      bathCount * price_per_bathroom;

    // Eco cleaning = +5%, Client provides materials = -5%
    if (isEcoCleaning) {
      baseCalculatedPrice *= 1.05;
    }
    if (materialsProvidedByClient) {
      baseCalculatedPrice *= 0.95;
    }

    // Get recurring types
    const recurringTypes = await this.prisma.recurringType.findMany();

    const estimates = recurringTypes.map((type) => {
      const discountPercent = Number(type.available_discount ?? 0);
      const discountAmount = baseCalculatedPrice * (discountPercent / 100);
      const finalPrice = Math.max(baseCalculatedPrice - discountAmount, 0);

      return {
        recurringTypeId: type.id,
        title: type.name,
        description: type.description,
        discountPercent,
        finalPrice,
        isEcoCleaning,
        materialsProvidedByClient,
      };
    });

    // Add one-time pricing
    const onetimeEstimate = {
      recurringTypeId: 'notASubcriptionTypeId',
      title: 'One Time',
      description: 'A Single time Cleaning Service',
      discountPercent: 0,
      finalPrice: baseCalculatedPrice,
      isEcoCleaning,
      materialsProvidedByClient,
    };

    estimates.push(onetimeEstimate);
    const totalDuration = (square_feet / 500) * service.durationMinutes;
    return {
      totalDuration,
      baseCalculatedPrice,
      estimates,
    };
  }

  // async getPriceEstimate(
  //   serviceId: string,
  //   square_feet: number,
  //   no_of_rooms: number,
  //   no_of_bathrooms: number,
  // ) {
  //   // Step 1: Get service info
  //   const service = await this.findOne(serviceId);
  //   const base_price = Number(service.base_price);
  //   const price_per_sqft = Number(service.square_foot_price);
  //   const price_per_room = Number(service.room_rate);
  //   const price_per_bathroom = Number(service.bathroom_rate);

  //   let roomCompount = no_of_rooms - 1;
  //   let bathCompount = no_of_bathrooms - 1;

  //   if (no_of_rooms <= 0) {
  //     roomCompount = 0;
  //   }

  //   if (no_of_bathrooms <= 0) {
  //     bathCompount = 0;
  //   }

  //   // Step 2: Calculate base price (without any subscription adjustments)
  //   const baseCalculatedPrice =
  //     base_price +
  //     ((square_feet - 1000) / 500) * price_per_sqft +
  //     roomCompount * price_per_room +
  //     bathCompount * price_per_bathroom;

  //   // Step 3: Get subscription types
  //   const recurringType = await this.prisma.recurringType.findMany();

  //   // Step 4: Loop through each subscription type and calculate the adjusted price
  //   let estimates = recurringType.map((sub) => {
  //     // For example, assume each subscription type has a discountPercent
  //     const discountPercent = Number(sub.available_discount || 0); // fallback to 0 if null
  //     const planprice = baseCalculatedPrice * Number(sub.dayFrequency);
  //     const discountedPrice = planprice - (planprice * discountPercent) / 100;

  //     return {
  //       subscriptionTypeId: sub.id,
  //       subscriptionName: sub.name,
  //       description: sub.description,
  //       discountPercent,
  //       finalPrice: Math.max(discountedPrice, 0), // prevent negative
  //     };
  //   });

  //   const onetimeEstimate = {
  //     subscriptionTypeId: 'notASubcriptionTypeId',
  //     subscriptionName: 'One Time',
  //     description: 'A Single time Cleaning Service',
  //     discountPercent: 0,
  //     finalPrice: baseCalculatedPrice, // prevent negative
  //   };

  //   estimates.push(onetimeEstimate);

  //   return {
  //     baseCalculatedPrice,
  //     estimates,
  //   };
  // }

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
