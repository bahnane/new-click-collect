import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import {
  AppLanguage,
  BusinessType,
  PrismaClient,
  ProductSubmissionStatus,
  Role,
  SaleUnit,
  Weekday,
  UserStatus,
} from '@prisma/client';
import { generatePickupSlotsForWindow } from '../src/pickup-slots/pickup-slot-generation.util';

const FIXTURE = {
  merchantEmail:
    process.env.SEED_FIXTURE_MERCHANT_EMAIL ?? 'merchant@mailinator.com',
  merchantPassword: process.env.SEED_FIXTURE_MERCHANT_PASSWORD ?? 'fixture123',
  merchantSlug: process.env.SEED_FIXTURE_MERCHANT_SLUG ?? 'boutique-fixture',
  merchantStoreName:
    process.env.SEED_FIXTURE_MERCHANT_STORE_NAME ?? 'Boutique Fixture',
  productsCount: Number(process.env.SEED_FIXTURE_PRODUCTS_COUNT ?? 120),
  offersCount: Number(process.env.SEED_FIXTURE_OFFERS_COUNT ?? 80),
  unofferedProductsCount: Number(
    process.env.SEED_FIXTURE_UNOFFERED_PRODUCTS_COUNT ?? 20,
  ),
  slotDaysAhead: Number(process.env.SEED_FIXTURE_SLOT_DAYS_AHEAD ?? 14),
  slotDurationHours: Number(process.env.SEED_FIXTURE_SLOT_DURATION_HOURS ?? 2),
  slotMaxOrders: Number(process.env.SEED_FIXTURE_SLOT_MAX_ORDERS ?? 10),
  productPrefix: process.env.SEED_FIXTURE_PRODUCT_PREFIX ?? '[FIXTURE] Produit',
  unofferedProductPrefix:
    process.env.SEED_FIXTURE_UNOFFERED_PRODUCT_PREFIX ??
    '[FIXTURE][SANS_OFFRE] Produit',
  categoryPrefix: process.env.SEED_FIXTURE_CATEGORY_PREFIX ?? 'fixture-',
  productImageUrl:
    process.env.SEED_FIXTURE_PRODUCT_IMAGE_URL ??
    'https://pub-3138360c3ea4422d844af86b6617cbc6.r2.dev/images/products/2026/5/a4089325-6468-4414-8805-c15f45fdfa32.jpg',
  productImageStorageKey:
    process.env.SEED_FIXTURE_PRODUCT_IMAGE_STORAGE_KEY ??
    'images/products/2026/5/a4089325-6468-4414-8805-c15f45fdfa32.jpg',
  emptyShopsCount: Number(process.env.SEED_FIXTURE_EMPTY_SHOPS_COUNT ?? 10),
  emptyShopSlugPrefix:
    process.env.SEED_FIXTURE_EMPTY_SHOP_SLUG_PREFIX ?? 'fixture-casa-shop',
  emptyShopEmailPrefix:
    process.env.SEED_FIXTURE_EMPTY_SHOP_EMAIL_PREFIX ?? 'fixture-casa-shop',
};

const CASABLANCA_CENTER = {
  latitude: 33.5731,
  longitude: -7.5898,
};

const CASABLANCA_STORE_NAMES = [
  'Hanout Maarif Test',
  'Epicerie Racine Test',
  'Boutique Gauthier Test',
  'Hanout Bourgogne Test',
  'Epicerie Palmier Test',
  'Boutique Anfa Test',
  'Hanout Oasis Test',
  'Epicerie Sidi Maarouf Test',
  'Boutique Ain Diab Test',
  'Hanout Californie Test',
];

const PICKUP_HOUR_SEEDS: Array<{
  dayOfWeek: Weekday;
  startHour: number;
  endHour: number;
}> = [
  { dayOfWeek: Weekday.MONDAY, startHour: 9, endHour: 21 },
  { dayOfWeek: Weekday.TUESDAY, startHour: 9, endHour: 21 },
  { dayOfWeek: Weekday.WEDNESDAY, startHour: 9, endHour: 21 },
  { dayOfWeek: Weekday.THURSDAY, startHour: 9, endHour: 21 },
  { dayOfWeek: Weekday.FRIDAY, startHour: 9, endHour: 21 },
  { dayOfWeek: Weekday.SATURDAY, startHour: 9, endHour: 21 },
  { dayOfWeek: Weekday.SUNDAY, startHour: 9, endHour: 21 },
];

const CATEGORY_SEEDS = [
  { name: 'Fixture Epicerie', slug: 'fixture-epicerie' },
  { name: 'Fixture Boissons', slug: 'fixture-boissons' },
  { name: 'Fixture Snacks', slug: 'fixture-snacks' },
  { name: 'Fixture Boulangerie', slug: 'fixture-boulangerie' },
];

const SUB_CATEGORY_SEEDS_BY_ROOT: Array<
  Array<{ name: string; slugSuffix: string }>
> = [
  [
    { name: 'Fixture Huiles', slugSuffix: 'huiles' },
    { name: 'Fixture Conserves', slugSuffix: 'conserves' },
  ],
  [
    { name: 'Fixture Jus', slugSuffix: 'jus' },
    { name: 'Fixture Eaux', slugSuffix: 'eaux' },
  ],
  [
    { name: 'Fixture Biscuits', slugSuffix: 'biscuits' },
    { name: 'Fixture Chips', slugSuffix: 'chips' },
  ],
  [
    { name: 'Fixture Pains', slugSuffix: 'pains' },
    { name: 'Fixture Viennoiseries', slugSuffix: 'viennoiseries' },
  ],
];

const SUBMISSION_SEEDS: Array<{
  name: string;
  description?: string;
  saleUnit: SaleUnit;
  priceInCents?: number;
  categoryIndex: number;
  status: ProductSubmissionStatus;
  rejectionReason?: string;
}> = [
  {
    name: "[FIXTURE] Proposition huile d'olive bio",
    description: "Huile d'olive extra vierge, pressée à froid, bouteille 1L.",
    saleUnit: SaleUnit.UNIT,
    priceInCents: 850,
    categoryIndex: 0,
    status: ProductSubmissionStatus.PENDING,
  },
  {
    name: '[FIXTURE] Proposition jus de mangue tropical',
    saleUnit: SaleUnit.LITER,
    priceInCents: 350,
    categoryIndex: 1,
    status: ProductSubmissionStatus.PENDING,
  },
  {
    name: '[FIXTURE] Proposition biscuits sésame',
    description: 'Biscuits artisanaux au sésame grillé, sachet 200g.',
    saleUnit: SaleUnit.KG,
    priceInCents: 220,
    categoryIndex: 2,
    status: ProductSubmissionStatus.APPROVED,
  },
  {
    name: '[FIXTURE] Proposition pain de mie complet',
    saleUnit: SaleUnit.UNIT,
    priceInCents: 180,
    categoryIndex: 3,
    status: ProductSubmissionStatus.APPROVED,
  },
  {
    name: '[FIXTURE] Proposition sauce harissa maison',
    description: 'Harissa artisanale, pot 250g.',
    saleUnit: SaleUnit.UNIT,
    priceInCents: 430,
    categoryIndex: 0,
    status: ProductSubmissionStatus.REJECTED,
    rejectionReason: 'Produit équivalent déjà disponible dans le catalogue.',
  },
  {
    name: '[FIXTURE] Proposition thé à la menthe',
    saleUnit: SaleUnit.UNIT,
    priceInCents: 290,
    categoryIndex: 1,
    status: ProductSubmissionStatus.PENDING,
  },
  {
    name: '[FIXTURE] Proposition chips artisanales',
    description: 'Chips de pomme de terre nature, sachet 150g.',
    saleUnit: SaleUnit.KG,
    categoryIndex: 2,
    status: ProductSubmissionStatus.PENDING,
  },
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
    SaleUnit.LITER,
    SaleUnit.PORTION,
  ];
  return units[i % units.length];
}

function pickSubCategoryId(
  subCategoriesByCategoryId: Record<string, string[]>,
  categoryId: string,
  itemIndex: number,
  frequency: number,
): string | null {
  const subCategoryIds = subCategoriesByCategoryId[categoryId] ?? [];
  if (subCategoryIds.length === 0) {
    return null;
  }

  if (itemIndex % frequency !== 0) {
    return null;
  }

  return subCategoryIds[itemIndex % subCategoryIds.length] ?? null;
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return x - Math.floor(x);
}

function randomizedCasablancaCoordinates(index: number): {
  latitude: number;
  longitude: number;
} {
  const latOffset = (pseudoRandom(index + 1) - 0.5) * 0.06;
  const lngOffset = (pseudoRandom(index + 101) - 0.5) * 0.08;

  return {
    latitude: Number((CASABLANCA_CENTER.latitude + latOffset).toFixed(6)),
    longitude: Number((CASABLANCA_CENTER.longitude + lngOffset).toFixed(6)),
  };
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

    // 2.b) Empty shops fixtures for dashboard map/list testing in Casablanca
    let emptyShopsUpserted = 0;

    for (let index = 0; index < FIXTURE.emptyShopsCount; index++) {
      const shopNumber = index + 1;
      const userEmail = `${FIXTURE.emptyShopEmailPrefix}+${pad4(shopNumber)}@mailinator.com`;
      const userPasswordHash = await argon2.hash(FIXTURE.merchantPassword);

      const user = await prisma.user.upsert({
        where: { email: userEmail },
        update: {
          role: Role.MERCHANT,
          status: UserStatus.ACTIVE,
          preferredLanguage: AppLanguage.fr,
          passwordHash: userPasswordHash,
        },
        create: {
          email: userEmail,
          passwordHash: userPasswordHash,
          role: Role.MERCHANT,
          status: UserStatus.ACTIVE,
          preferredLanguage: AppLanguage.fr,
        },
      });

      const storeName =
        CASABLANCA_STORE_NAMES[index] ??
        `Boutique Casablanca Test ${pad4(shopNumber)}`;
      const slug = `${FIXTURE.emptyShopSlugPrefix}-${pad4(shopNumber)}`;
      const coordinates = randomizedCasablancaCoordinates(shopNumber);

      await prisma.merchantProfile.upsert({
        where: { userId: user.id },
        update: {
          slug,
          storeName,
          businessType:
            index % 2 === 0 ? BusinessType.HANOUTE : BusinessType.PATISSERIE,
          description: 'Boutique vide de fixture pour tests dashboard.',
          city: 'Casablanca',
          address: `${10 + shopNumber} Rue de test, Casablanca`,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          isActive: true,
        },
        create: {
          userId: user.id,
          slug,
          storeName,
          businessType:
            index % 2 === 0 ? BusinessType.HANOUTE : BusinessType.PATISSERIE,
          description: 'Boutique vide de fixture pour tests dashboard.',
          city: 'Casablanca',
          address: `${10 + shopNumber} Rue de test, Casablanca`,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          isActive: true,
        },
      });

      emptyShopsUpserted++;
    }

    const fixtureProductImageAsset = await prisma.imageAsset.upsert({
      where: { storageKey: FIXTURE.productImageStorageKey },
      update: {
        cdnUrl: FIXTURE.productImageUrl,
        altText: 'Image produit fixture',
      },
      create: {
        storageProvider: 'r2',
        storageKey: FIXTURE.productImageStorageKey,
        cdnUrl: FIXTURE.productImageUrl,
        altText: 'Image produit fixture',
        mimeType: 'image/jpeg',
      },
      select: { id: true },
    });

    // 3) Pickup hours fixture
    for (const pickupHour of PICKUP_HOUR_SEEDS) {
      await prisma.merchantPickupHour.upsert({
        where: {
          merchantId_dayOfWeek: {
            merchantId: merchantProfile.id,
            dayOfWeek: pickupHour.dayOfWeek,
          },
        },
        update: {
          startHour: pickupHour.startHour,
          endHour: pickupHour.endHour,
        },
        create: {
          merchantId: merchantProfile.id,
          dayOfWeek: pickupHour.dayOfWeek,
          startHour: pickupHour.startHour,
          endHour: pickupHour.endHour,
        },
      });
    }

    // 4) Categories fixture
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

    // 4.b) Sub-categories fixture (enfants des categories principales)
    const subCategoriesByCategoryId: Record<string, string[]> = {};

    for (let index = 0; index < categories.length; index++) {
      const rootCategory = categories[index];
      const subCategorySeeds = SUB_CATEGORY_SEEDS_BY_ROOT[index] ?? [];
      const subCategoryIds: string[] = [];

      for (const subCategorySeed of subCategorySeeds) {
        const slug = `${rootCategory.slug}-${subCategorySeed.slugSuffix}`;

        const subCategory = await prisma.productCategory.upsert({
          where: { slug },
          update: {
            parentId: rootCategory.id,
            name: subCategorySeed.name,
            isActive: true,
          },
          create: {
            parentId: rootCategory.id,
            slug,
            name: subCategorySeed.name,
            description: 'Sous-categorie fixture pour tests pagination',
            isActive: true,
          },
        });

        subCategoryIds.push(subCategory.id);
      }

      subCategoriesByCategoryId[rootCategory.id] = subCategoryIds;
    }

    // 5) Products fixture (pool avec offres)
    const offeredCandidateProductIds: string[] = [];
    let offeredProductsLinkedToSubCategory = 0;

    for (let i = 1; i <= FIXTURE.productsCount; i++) {
      const number = pad4(i);
      const category = categories[i % categories.length];
      const subCategoryId = pickSubCategoryId(
        subCategoriesByCategoryId,
        category.id,
        i,
        3,
      );
      const name = `${FIXTURE.productPrefix} ${number}`;

      // Product.name n'est pas unique: on évite les doublons via findFirst + create.
      const existing = await prisma.product.findFirst({
        where: { name, categoryId: category.id },
        select: { id: true, subCategoryId: true, imageAssetId: true },
      });

      if (existing) {
        if (
          (existing.subCategoryId ?? null) !== subCategoryId ||
          (existing.imageAssetId ?? null) !== fixtureProductImageAsset.id
        ) {
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              subCategoryId,
              imageAssetId: fixtureProductImageAsset.id,
            },
          });
        }

        if (subCategoryId) {
          offeredProductsLinkedToSubCategory++;
        }

        offeredCandidateProductIds.push(existing.id);
        continue;
      }

      const created = await prisma.product.create({
        data: {
          name,
          description: 'Produit fixture pour tester la pagination boutique',
          saleUnit: saleUnitFor(i),
          priceInCents: priceInCentsFor(i),
          categoryId: category.id,
          subCategoryId,
          imageAssetId: fixtureProductImageAsset.id,
          isActive: true,
        },
        select: { id: true },
      });

      if (subCategoryId) {
        offeredProductsLinkedToSubCategory++;
      }

      offeredCandidateProductIds.push(created.id);
    }

    // 5.b) Produits sans offre, facilement identifiables pour tester la creation
    const unofferedProductIds: string[] = [];
    let unofferedProductsLinkedToSubCategory = 0;

    for (let i = 1; i <= FIXTURE.unofferedProductsCount; i++) {
      const number = pad4(i);
      const category = categories[i % categories.length];
      const subCategoryId = pickSubCategoryId(
        subCategoriesByCategoryId,
        category.id,
        i,
        2,
      );
      const name = `${FIXTURE.unofferedProductPrefix} ${number}`;

      const existing = await prisma.product.findFirst({
        where: { name, categoryId: category.id },
        select: { id: true, subCategoryId: true, imageAssetId: true },
      });

      if (existing) {
        if (
          (existing.subCategoryId ?? null) !== subCategoryId ||
          (existing.imageAssetId ?? null) !== fixtureProductImageAsset.id
        ) {
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              subCategoryId,
              imageAssetId: fixtureProductImageAsset.id,
            },
          });
        }

        if (subCategoryId) {
          unofferedProductsLinkedToSubCategory++;
        }

        unofferedProductIds.push(existing.id);
        continue;
      }

      const created = await prisma.product.create({
        data: {
          name,
          description:
            "Produit fixture sans offre, dedie aux tests de creation d'offre",
          saleUnit: saleUnitFor(i),
          priceInCents: priceInCentsFor(i + FIXTURE.productsCount),
          categoryId: category.id,
          subCategoryId,
          imageAssetId: fixtureProductImageAsset.id,
          isActive: true,
        },
        select: { id: true },
      });

      if (subCategoryId) {
        unofferedProductsLinkedToSubCategory++;
      }

      unofferedProductIds.push(created.id);
    }

    // 6) Store offers fixture (subset du pool dedie aux offres)
    const offerCount = Math.min(
      FIXTURE.offersCount,
      offeredCandidateProductIds.length,
    );

    for (let i = 0; i < offerCount; i++) {
      const productId = offeredCandidateProductIds[i];

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

    // 7) Pickup slots fixture (prochains jours)
    const rowsToCreate = generatePickupSlotsForWindow({
      merchantId: merchantProfile.id,
      pickupHours: PICKUP_HOUR_SEEDS,
      daysAhead: FIXTURE.slotDaysAhead,
      now: new Date(),
      slotDurationHours: FIXTURE.slotDurationHours,
    });

    const createdSlots =
      rowsToCreate.length > 0
        ? await prisma.pickupSlot.createMany({
            data: rowsToCreate,
            skipDuplicates: true,
          })
        : { count: 0 };

    // 8) Product submissions fixture
    let submissionsCreated = 0;

    for (const s of SUBMISSION_SEEDS) {
      const category = categories[s.categoryIndex % categories.length];

      const existing = await prisma.productSubmission.findFirst({
        where: { merchantId: merchantProfile.id, name: s.name },
        select: { id: true },
      });

      if (existing) {
        continue;
      }

      await prisma.productSubmission.create({
        data: {
          merchantId: merchantProfile.id,
          name: s.name,
          description: s.description ?? null,
          saleUnit: s.saleUnit,
          priceInCents: s.priceInCents ?? null,
          categoryId: category.id,
          status: s.status,
          rejectionReason: s.rejectionReason ?? null,
          reviewedAt:
            s.status !== ProductSubmissionStatus.PENDING ? new Date() : null,
        },
      });

      submissionsCreated++;
    }

    console.log('✓ Fixture seed completed');
    console.log(`  Merchant slug: ${FIXTURE.merchantSlug}`);
    console.log(`  Empty Casablanca shops upserted: ${emptyShopsUpserted}`);
    console.log(`  Products target (offer pool): ${FIXTURE.productsCount}`);
    console.log(
      `  Products linked to sub-categories (offer pool): ${offeredProductsLinkedToSubCategory}`,
    );
    console.log(
      `  Products target (no-offer pool): ${FIXTURE.unofferedProductsCount}`,
    );
    console.log(
      `  Products linked to sub-categories (no-offer pool): ${unofferedProductsLinkedToSubCategory}`,
    );
    console.log(`  Offers target: ${offerCount}`);
    console.log(`  No-offer product prefix: ${FIXTURE.unofferedProductPrefix}`);
    console.log(`  No-offer products available: ${unofferedProductIds.length}`);
    console.log(`  Pickup hours seeded: ${PICKUP_HOUR_SEEDS.length}`);
    console.log(`  Pickup slots created: ${createdSlots.count}`);
    console.log(`  Submissions created: ${submissionsCreated}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
