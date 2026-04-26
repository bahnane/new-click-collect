import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

// TODO: check values
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@click-collect.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined');

  const adapter = new PrismaMariaDb(databaseUrl);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();

    const existing = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL.trim().toLowerCase() },
    });

    if (existing) {
      console.log(`Admin already exists: ${existing.email}`);
      return;
    }

    const passwordHash = await argon2.hash(ADMIN_PASSWORD);

    const admin = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL.trim().toLowerCase(),
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    console.log(`✓ Admin created: ${admin.email} (id: ${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
