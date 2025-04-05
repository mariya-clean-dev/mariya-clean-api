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

  // Create services
  const regularService = await prisma.service.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      name: 'Regular Home Cleaning',
      description: 'Standard cleaning service for homes',
      durationMinutes: 120,
      isActive: true,
      base_price: 150,
      bathroom_rate: 200,
      room_rate: 300,
      square_foot_price: 1.5,
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
      isActive: true,
      base_price: 190,
      bathroom_rate: 250,
      room_rate: 350,
      square_foot_price: 2.5,
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
