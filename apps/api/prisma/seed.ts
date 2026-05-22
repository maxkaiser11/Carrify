import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaNeon } from '@prisma/adapter-neon';

const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
    await prisma.user.createMany({
        data: [
            {email: 'alice@example.com', name: 'Alice'},
            {email: 'bob@example.com', name: 'Bob'},
            {email: 'carol@example.com', name: 'Carol'},
        ],
        skipDuplicates: true,
    });

    const users = await prisma.user.findMany();
    console.log('Seeded users: ', users);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());