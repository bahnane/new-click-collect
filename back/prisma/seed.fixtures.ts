import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import {
  AppLanguage,
  BusinessType,
  PrismaClient,
  Role,
  SaleUnit,
  UserStatus,
} from '@prisma/client';

const FIXTURE = {
  merchantEmail:
    process.env.SEED_FIXTURE_MERCHANT_EMAIL ??
    'fixture-merchant@click-collect.local',
  merchantPassword: process.env.SEED_FIXTURE_MERCHANT_PASSWORD ?? 'fixture123',
  merchantSlug: process.env.SEED_FIXTURE_MERCHANT_SLUG ?? 'boutique-fixture',
  merchantStoreName:
    process.env.SEED_FIXTURE_MERCHANT_STORE_NAME ?? 'Boutique Fixture',
  productsCount: Number(process.env.SEED_FIXTURE_PRODUCTS_COUNT ?? 120),
  offersCount: Number(process.env.SEED_FIXTURE_OFFERS_COUNT ?? 80),
  productPrefix: process.env.SEED_FIXTURE_PRODUCT_PREFIX ?? '[FIXTURE] Produit',
  categoryPrefix: process.env.SEED_FIXTURE_CATEGORY_PREFIX ?? 'fixture-',
};

const CATEGORY_SEEDS = [
  { name: 'Fixture Epicerie', slug: 'fixture-epicerie' },
  { name: 'Fixture Boissons', slug: 'fixture-boissons' },
  { name: 'Fixture Snacks', slug: 'fixture-snacks' },
  { name: 'Fixture Boulangerie', slug: 'fixture-boulangerie' },
];

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

function priceInCentsFor(i: number): number {
  return 100 + (i % 40) * 25; // 1.00 -> 10.75
}

function saleUnitFor(i: number): SaleUnit {
  const units: SaleUnit[] = [
    SaleUnit.UNIT,
    SaleUnit.KG,
    SaleUnit.G,
    SaleUnit.LITER,
    SaleUnit.PORTION,
  ];
  return units[i % units.length];
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined');

  const adapter = new PrismaMariaDb(databaseUrl);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();

    // 1) Merchant fixture user
    const merchantEmail = FIXTURE.merchantEmail.trim().toLowerCase();
    const merchantPasswordHash = await argon2.hash(FIXTURE.merchantPassword);

    const merchantUser = await prisma.user.upsert({
      where: { email: merchantEmail },
      update: {
        role: Role.MERCHANT,
        status: UserStatus.ACTIVE,
        preferredLanguage: AppLanguage.fr,
        passwordHash: merchantPasswordHash,
      },
      create: {
        email: merchantEmail,
        passwordHash: merchantPasswordHash,
        role: Role.MERCHANT,
        status: UserStatus.ACTIVE,
        preferredLanguage: AppLanguage.fr,
      },
    });

    // 2) Merchant profile fixture
    await prisma.merchantProfile.upsert({
      where: { userId: merchantUser.id },
      update: {
        slug: FIXTURE.merchantSlug,
        storeName: FIXTURE.merchantStoreName,
        businessType: BusinessType.HANOUTE,
        isActive: true,
        description: 'Marchand de test pagination (fixture).',
      },
      create: {
        userId: merchantUser.id,
        slug: FIXTURE.merchantSlug,
        storeName: FIXTURE.merchantStoreName,
        businessType: BusinessType.HANOUTE,
        isActive: true,
        description: 'Marchand de test pagination (fixture).',
      },
    });

    const merchantProfile = await prisma.merchantProfile.findUniqueOrThrow({
      where: { userId: merchantUser.id },
      select: { id: true },
    });

    // 3) Categories fixture
    const categories = [];
    for (const c of CATEGORY_SEEDS) {
      const slug = c.slug.startsWith(FIXTURE.categoryPrefix)
        ? c.slug
        : `${FIXTURE.categoryPrefix}${c.slug}`;

      const category = await prisma.productCategory.upsert({
        where: { slug },
        update: { name: c.name, isActive: true },
        create: {
          slug,
          name: c.name,
          description: 'Categorie fixture pour tests pagination',
          isActive: true,
        },
      });

      categories.push(category);
    }

    // 4) Products fixture
    const createdOrExistingProductIds: string[] = [];

    for (let i = 1; i <= FIXTURE.productsCount; i++) {
      const number = pad4(i);
      const category = categories[i % categories.length];
      const name = `${FIXTURE.productPrefix} ${number}`;

      // Product.name n'est pas unique: on évite les doublons via findFirst + create.
      const existing = await prisma.product.findFirst({
        where: { name, categoryId: category.id },
        select: { id: true },
      });

      if (existing) {
        createdOrExistingProductIds.push(existing.id);
        continue;
      }

      const created = await prisma.product.create({
        data: {
          name,
          description: 'Produit fixture pour tester la pagination boutique',
          saleUnit: saleUnitFor(i),
          priceInCents: priceInCentsFor(i),
          categoryId: category.id,
          isActive: true,
        },
        select: { id: true },
      });

      createdOrExistingProductIds.push(created.id);
    }

    // 5) Store offers fixture (subset des produits)
    const offerCount = Math.min(
      FIXTURE.offersCount,
      createdOrExistingProductIds.length,
    );

    for (let i = 0; i < offerCount; i++) {
      const productId = createdOrExistingProductIds[i];

      await prisma.storeOffer.upsert({
        where: {
          merchantId_productId: {
            merchantId: merchantProfile.id,
            productId,
          },
        },
        update: {
          isActive: true,
          minOrderQty: '1',
          stepQty: '1',
          // null => utilise prix produit par defaut
          priceInCents: i % 5 === 0 ? null : priceInCentsFor(i + 1) + 50,
        },
        create: {
          merchantId: merchantProfile.id,
          productId,
          isActive: true,
          minOrderQty: '1',
          stepQty: '1',
          priceInCents: i % 5 === 0 ? null : priceInCentsFor(i + 1) + 50,
        },
      });
    }

    console.log('✓ Fixture seed completed');
    console.log(`  Merchant slug: ${FIXTURE.merchantSlug}`);
    console.log(`  Products target: ${FIXTURE.productsCount}`);
    console.log(`  Offers target: ${offerCount}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
