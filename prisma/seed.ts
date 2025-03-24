import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Create roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin' },
  });

  const staffRole = await prisma.role.upsert({
    where: { name: 'staff' },
    update: {},
    create: { name: 'staff' },
  });

  const customerRole = await prisma.role.upsert({
    where: { name: 'customer' },
    update: {},
    create: { name: 'customer' },
  });

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@maria-cleaning.com' },
    update: {},
    create: {
      email: 'admin@maria-cleaning.com',
      name: 'Admin User',
      password: adminPassword,
      roleId: adminRole.id,
      status: 'active',
    },
  });

  // Create regions
  const region1 = await prisma.region.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      name: 'Downtown',
    },
  });

  const region2 = await prisma.region.upsert({
    where: { id: '2' },
    update: {},
    create: {
      id: '2',
      name: 'Suburbs',
    },
  });

  // Create service categories
  const regularCategory = await prisma.serviceCategory.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      name: 'Regular Cleaning',
      description: 'Standard cleaning services for homes',
    },
  });

  const deepCategory = await prisma.serviceCategory.upsert({
    where: { id: '2' },
    update: {},
    create: {
      id: '2',
      name: 'Deep Cleaning',
      description: 'Thorough cleaning for homes that need extra attention',
    },
  });

  // Create services
  const regularService = await prisma.service.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      name: 'Regular Home Cleaning',
      description: 'Standard cleaning service for homes',
      durationMinutes: 120,
      monthlySlots: 100,
      isActive: true,
    },
  });

  const deepService = await prisma.service.upsert({
    where: { id: '2' },
    update: {},
    create: {
      id: '2',
      name: 'Deep Home Cleaning',
      description: 'Thorough cleaning service for homes',
      durationMinutes: 240,
      monthlySlots: 50,
      isActive: true,
    },
  });

  // Create service category mappings
  await prisma.serviceCategoryMapping.upsert({
    where: {
      serviceId_categoryId: {
        serviceId: regularService.id,
        categoryId: regularCategory.id,
      },
    },
    update: {},
    create: {
      serviceId: regularService.id,
      categoryId: regularCategory.id,
    },
  });

  await prisma.serviceCategoryMapping.upsert({
    where: {
      serviceId_categoryId: {
        serviceId: deepService.id,
        categoryId: deepCategory.id,
      },
    },
    update: {},
    create: {
      serviceId: deepService.id,
      categoryId: deepCategory.id,
    },
  });

  // Create base plans
  await prisma.basePlan.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      serviceId: regularService.id,
      regionId: region1.id,
      minimumArea: 500,
      maximumArea: 1000,
      price: 100,
      currency: 'USD',
    },
  });

  await prisma.basePlan.upsert({
    where: { id: '2' },
    update: {},
    create: {
      id: '2',
      serviceId: regularService.id,
      regionId: region1.id,
      minimumArea: 1001,
      maximumArea: 2000,
      price: 150,
      currency: 'USD',
    },
  });

  await prisma.basePlan.upsert({
    where: { id: '3' },
    update: {},
    create: {
      id: '3',
      serviceId: deepService.id,
      regionId: region1.id,
      minimumArea: 500,
      maximumArea: 1000,
      price: 180,
      currency: 'USD',
    },
  });

  await prisma.basePlan.upsert({
    where: { id: '4' },
    update: {},
    create: {
      id: '4',
      serviceId: deepService.id,
      regionId: region1.id,
      minimumArea: 1001,
      maximumArea: 2000,
      price: 250,
      currency: 'USD',
    },
  });

  // Create price charts
  await prisma.priceChart.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      serviceId: regularService.id,
      priceType: 'per_room',
      price: 25,
    },
  });

  await prisma.priceChart.upsert({
    where: { id: '2' },
    update: {},
    create: {
      id: '2',
      serviceId: regularService.id,
      priceType: 'per_bathroom',
      price: 30,
    },
  });

  await prisma.priceChart.upsert({
    where: { id: '3' },
    update: {},
    create: {
      id: '3',
      serviceId: deepService.id,
      priceType: 'hourly',
      price: 60,
    },
  });

  // Create service add-ons
  await prisma.serviceAddOn.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      serviceId: regularService.id,
      name: 'Window Cleaning',
      description: 'Clean all windows inside and out',
      price: 40,
    },
  });

  await prisma.serviceAddOn.upsert({
    where: { id: '2' },
    update: {},
    create: {
      id: '2',
      serviceId: regularService.id,
      name: 'Refrigerator Cleaning',
      description: 'Clean inside and out of refrigerator',
      price: 30,
    },
  });

  await prisma.serviceAddOn.upsert({
    where: { id: '3' },
    update: {},
    create: {
      id: '3',
      serviceId: deepService.id,
      name: 'Oven Cleaning',
      description: 'Deep clean oven interior and exterior',
      price: 45,
    },
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
