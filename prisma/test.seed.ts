import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding started...');

    // ======================
    // 1. ROLES
    // ======================
    const adminRole = await prisma.role.upsert({
        where: { name: 'admin' },
        update: {},
        create: { name: 'admin' },
    });

    const customerRole = await prisma.role.upsert({
        where: { name: 'customer' },
        update: {},
        create: { name: 'customer' },
    });

    const staffRole = await prisma.role.upsert({
        where: { name: 'staff' },
        update: {},
        create: { name: 'staff' },
    });

    // ======================
    // 2. USERS
    // ======================
    const hashedAdminPassword = await bcrypt.hash('admin123', 10);
    const hashedCustomerPassword = await bcrypt.hash('customer123', 10);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@test.com' },
        update: {},
        create: {
            name: 'Admin User',
            email: 'admin@test.com',
            phone: '9999999999',
            roleId: adminRole.id,
            password: hashedAdminPassword,
        },
    });

    const customer = await prisma.user.upsert({
        where: { email: 'customer@test.com' },
        update: {},
        create: {
            name: 'Test Customer',
            email: 'customer@test.com',
            phone: '8888888888',
            roleId: customerRole.id,
            password: hashedCustomerPassword,
        },
    });

    const staff = await prisma.user.upsert({
        where: { email: 'staff@test.com' },
        update: {},
        create: {
            name: 'Staff User',
            email: 'staff@test.com',
            phone: '7777777777',
            roleId: staffRole.id,
        },
    });

    // ======================
    // 3. ZONE + PINCODE
    // ======================

    const zone = await prisma.zone.upsert({
        where: { code: 'ZONE_KOCHI' },
        update: {},
        create: {
            name: 'Kochi Zone',
            code: 'ZONE_KOCHI',
            isActive: true,
        },
    });

    await prisma.pincode.upsert({
        where: { code: '682001' },
        update: {},
        create: {
            code: '682001',
            zoneId: zone.id,
            isActive: true,
        },
    });

    // ======================
    // 4. SERVICE
    // ======================

    const service = await prisma.service.upsert({
        where: { id: 'service-cleaning-1' },
        update: {},
        create: {
            id: 'service-cleaning-1',
            name: 'Home Cleaning',
            description: 'Full home deep cleaning',
            durationMinutes: 120,
            base_price: 200,
            square_foot_price: 100,
            room_rate: 50,
            bathroom_rate: 30,
            isActive: true,
        },
    });

    // ======================
    // 5. RECURRING TYPES
    // ======================

    const recurringTypes = [
        { name: 'weekly', dayFrequency: 7, discount: 10 },
        { name: 'bi_weekly', dayFrequency: 14, discount: 15 },
        { name: 'four-weekly', dayFrequency: 28, discount: 20 },
    ];

    for (const type of recurringTypes) {
        await prisma.recurringType.upsert({
            where: { name: type.name },
            update: {},
            create: {
                name: type.name,
                description: `${type.name} cleaning`,
                dayFrequency: type.dayFrequency,
                available_discount: type.discount,
                cycleWeeks: type.name === 'four-weekly' ? 4 : 2,
            },
        });
    }

    // ======================
    // 6. ADD-ONS (Optional)
    // ======================

    await prisma.serviceAddOn.createMany({
        data: [
            {
                serviceId: service.id,
                name: 'Sofa Cleaning',
                price: 100,
            },
            {
                serviceId: service.id,
                name: 'Kitchen Deep Clean',
                price: 150,
            },
        ],
        skipDuplicates: true,
    });

    console.log('✅ Seeding completed');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });