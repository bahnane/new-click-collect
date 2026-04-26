import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

const FIXTURE = {
  merchantEmail:
    process.env.SEED_FIXTURE_MERCHANT_EMAIL ??
    'fixture-merchant@click-collect.local',
  merchantSlug: process.env.SEED_FIXTURE_MERCHANT_SLUG ?? 'boutique-fixture',
  productPrefix: process.env.SEED_FIXTURE_PRODUCT_PREFIX ?? '[FIXTURE] Produit',
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

    // Produits fixtures
    const deletedProducts = await prisma.product.deleteMany({
      where: {
        name: { startsWith: FIXTURE.productPrefix },
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
    console.log(`  Categories deleted: ${deletedCategories.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
