
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Checking database content...');

    try {
        // Check pincodes
        const pincodes = await prisma.pincode.findMany({
            take: 10,
            include: {
                zone: true,
            },
        });

        if (pincodes.length === 0) {
            console.log('No pincodes found in database.');
        } else {
            console.log(`Found ${pincodes.length} pincodes (listing first 10):`);
            pincodes.forEach((p) => {
                console.log(`- Pincode: ${p.code}, Active: ${p.isActive}, DeletedAt: ${p.deletedAt}`);
                if (p.zone) {
                    console.log(`  Zone: ${p.zone.code} (${p.zone.name}), Active: ${p.zone.isActive}, DeletedAt: ${p.zone.deletedAt}`);
                } else {
                    console.log('  No zone assigned.');
                }
            });
        }

        // Check zones independently
        const zones = await prisma.zone.findMany({
            take: 5,
        });
        console.log(`Checking zones independently... Found ${zones.length}:`);
        zones.forEach(z => {
            console.log(`- Zone: ${z.name} (${z.code}), Active: ${z.isActive}, DeletedAt: ${z.deletedAt}`);
        });

    } catch (error) {
        console.error('Error querying database:', error);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
