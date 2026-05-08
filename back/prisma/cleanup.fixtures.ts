import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

const FIXTURE = {
  merchantEmail:
    process.env.SEED_FIXTURE_MERCHANT_EMAIL ?? 'merchant@mailinator.com',
  merchantSlug: process.env.SEED_FIXTURE_MERCHANT_SLUG ?? 'boutique-fixture',
  productPrefix: process.env.SEED_FIXTURE_PRODUCT_PREFIX ?? '[FIXTURE] Produit',
  unofferedProductPrefix:
    process.env.SEED_FIXTURE_UNOFFERED_PRODUCT_PREFIX ??
    '[FIXTURE][SANS_OFFRE] Produit',
  categoryPrefix: process.env.SEED_FIXTURE_CATEGORY_PREFIX ?? 'fixture-',
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined');

  const adapter = new PrismaMariaDb(databaseUrl);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();

    const merchant = await prisma.merchantProfile.findUnique({
      where: { slug: FIXTURE.merchantSlug },
      select: { id: true, userId: true },
    });

    if (merchant) {
      // Nettoyage des données liées au marchand fixture
      await prisma.$transaction(async (tx) => {
        // En premier, lignes de panier liées aux offres du marchand
        await tx.cartItem.deleteMany({
          where: { storeOffer: { merchantId: merchant.id } },
        });

        // Supprime aussi les orders liés au marchand (OrderItem cascade via relation orderId)
        await tx.order.deleteMany({
          where: { merchantId: merchant.id },
        });

        // Puis les offres du marchand
        await tx.storeOffer.deleteMany({
          where: { merchantId: merchant.id },
        });

        // Soumissions produit du marchand fixture
        await tx.productSubmission.deleteMany({
          where: { merchantId: merchant.id },
        });

        // Autres dépendances potentielles
        await tx.pickupSlot.deleteMany({
          where: { merchantId: merchant.id },
        });

        await tx.cart.deleteMany({
          where: { merchantId: merchant.id },
        });

        // Profil puis user
        await tx.merchantProfile.delete({
          where: { id: merchant.id },
        });

        await tx.user.deleteMany({
          where: {
            OR: [
              { id: merchant.userId },
              { email: FIXTURE.merchantEmail.trim().toLowerCase() },
            ],
          },
        });
      });

      console.log('✓ Merchant fixture data removed');
    } else {
      console.log('No fixture merchant found, skipping merchant cleanup.');
    }

    // Soumissions fixtures restantes par catégories fixture
    const deletedSubmissionsByCategory =
      await prisma.productSubmission.deleteMany({
        where: {
          category: {
            slug: { startsWith: FIXTURE.categoryPrefix },
          },
        },
      });

    // Produits fixtures par préfixes connus
    const deletedProducts = await prisma.product.deleteMany({
      where: {
        OR: [
          { name: { startsWith: FIXTURE.productPrefix } },
          { name: { startsWith: FIXTURE.unofferedProductPrefix } },
          { name: { startsWith: '[FIXTURE] Proposition' } },
        ],
      },
    });

    // Produits fixtures restants liés aux catégories fixture
    const deletedProductsByCategory = await prisma.product.deleteMany({
      where: {
        category: {
          slug: { startsWith: FIXTURE.categoryPrefix },
        },
      },
    });

    // Catégories fixtures (après produits, car relation Restrict)
    const deletedCategories = await prisma.productCategory.deleteMany({
      where: {
        slug: { startsWith: FIXTURE.categoryPrefix },
      },
    });

    console.log('✓ Fixture cleanup completed');
    console.log(`  Products deleted: ${deletedProducts.count}`);
    console.log(
      `  Products deleted (by category): ${deletedProductsByCategory.count}`,
    );
    console.log(
      `  Product submissions deleted (by category): ${deletedSubmissionsByCategory.count}`,
    );
    console.log(`  Categories deleted: ${deletedCategories.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
