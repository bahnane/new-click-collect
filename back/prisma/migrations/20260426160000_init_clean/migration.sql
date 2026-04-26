-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'MERCHANT', 'CUSTOMER') NOT NULL DEFAULT 'CUSTOMER',
    `status` ENUM('INVITED', 'ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `preferredLanguage` ENUM('fr', 'ar') NOT NULL DEFAULT 'fr',
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `merchant_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(140) NOT NULL,
    `storeName` VARCHAR(120) NOT NULL,
    `businessType` ENUM('HANOUTE', 'PATISSERIE') NOT NULL,
    `description` TEXT NULL,
    `phone` VARCHAR(30) NULL,
    `address` VARCHAR(255) NULL,
    `city` VARCHAR(100) NULL,
    `zipCode` VARCHAR(10) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `merchant_profiles_userId_key`(`userId`),
    UNIQUE INDEX `merchant_profiles_slug_key`(`slug`),
    INDEX `merchant_profiles_businessType_idx`(`businessType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `merchant_opening_hours` (
    `id` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `dayOfWeek` ENUM('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY') NOT NULL,
    `startHour` INTEGER NOT NULL,
    `endHour` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `merchant_opening_hours_merchantId_dayOfWeek_idx`(`merchantId`, `dayOfWeek`),
    UNIQUE INDEX `merchant_opening_hours_merchantId_dayOfWeek_key`(`merchantId`, `dayOfWeek`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `merchant_pickup_hours` (
    `id` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `dayOfWeek` ENUM('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY') NOT NULL,
    `startHour` INTEGER NOT NULL,
    `endHour` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `merchant_pickup_hours_merchantId_dayOfWeek_idx`(`merchantId`, `dayOfWeek`),
    UNIQUE INDEX `merchant_pickup_hours_merchantId_dayOfWeek_key`(`merchantId`, `dayOfWeek`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_categories_name_key`(`name`),
    UNIQUE INDEX `product_categories_slug_key`(`slug`),
    INDEX `product_categories_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `saleUnit` ENUM('KG', 'G', 'LITER', 'UNIT', 'PORTION') NOT NULL DEFAULT 'UNIT',
    `priceInCents` INTEGER NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `products_name_idx`(`name`),
    INDEX `products_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_offers` (
    `id` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `priceInCents` INTEGER NULL,
    `minOrderQty` DECIMAL(10, 3) NOT NULL DEFAULT 1,
    `stepQty` DECIMAL(10, 3) NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `store_offers_merchantId_isActive_idx`(`merchantId`, `isActive`),
    INDEX `store_offers_merchantId_createdAt_idx`(`merchantId`, `createdAt`),
    UNIQUE INDEX `store_offers_merchantId_productId_key`(`merchantId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `carts` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `carts_customerId_key`(`customerId`),
    INDEX `carts_merchantId_idx`(`merchantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cart_items` (
    `id` VARCHAR(191) NOT NULL,
    `cartId` VARCHAR(191) NOT NULL,
    `storeOfferId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(10, 3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `cart_items_cartId_idx`(`cartId`),
    INDEX `cart_items_storeOfferId_idx`(`storeOfferId`),
    UNIQUE INDEX `cart_items_cartId_storeOfferId_key`(`cartId`, `storeOfferId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pickup_slots` (
    `id` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `maxOrders` INTEGER NOT NULL DEFAULT 10,
    `currentOrders` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `pickup_slots_merchantId_startsAt_idx`(`merchantId`, `startsAt`),
    INDEX `pickup_slots_merchantId_isActive_idx`(`merchantId`, `isActive`),
    UNIQUE INDEX `pickup_slots_merchantId_startsAt_endsAt_key`(`merchantId`, `startsAt`, `endsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `pickupSlotId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'READY', 'COLLECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `estimatedTotalInCents` INTEGER NOT NULL,
    `finalTotalInCents` INTEGER NULL,
    `pickupStartsAt` DATETIME(3) NOT NULL,
    `pickupEndsAt` DATETIME(3) NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `collectedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,

    INDEX `orders_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `orders_merchantId_status_idx`(`merchantId`, `status`),
    INDEX `orders_merchantId_createdAt_idx`(`merchantId`, `createdAt`),
    INDEX `orders_pickupSlotId_idx`(`pickupSlotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `storeOfferId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `productName` VARCHAR(191) NOT NULL,
    `saleUnit` ENUM('KG', 'G', 'LITER', 'UNIT', 'PORTION') NOT NULL,
    `quantity` DECIMAL(10, 3) NOT NULL,
    `unitPriceInCents` INTEGER NOT NULL,
    `lineTotalInCents` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_items_orderId_idx`(`orderId`),
    INDEX `order_items_storeOfferId_idx`(`storeOfferId`),
    INDEX `order_items_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_tokenHash_key`(`tokenHash`),
    INDEX `refresh_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_tokens_tokenHash_key`(`tokenHash`),
    INDEX `password_reset_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invite_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `invite_tokens_tokenHash_key`(`tokenHash`),
    INDEX `invite_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `merchant_profiles` ADD CONSTRAINT `merchant_profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merchant_opening_hours` ADD CONSTRAINT `merchant_opening_hours_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `merchant_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merchant_pickup_hours` ADD CONSTRAINT `merchant_pickup_hours_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `merchant_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `product_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_offers` ADD CONSTRAINT `store_offers_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `merchant_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_offers` ADD CONSTRAINT `store_offers_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carts` ADD CONSTRAINT `carts_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carts` ADD CONSTRAINT `carts_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `merchant_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_cartId_fkey` FOREIGN KEY (`cartId`) REFERENCES `carts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_storeOfferId_fkey` FOREIGN KEY (`storeOfferId`) REFERENCES `store_offers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pickup_slots` ADD CONSTRAINT `pickup_slots_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `merchant_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `merchant_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_pickupSlotId_fkey` FOREIGN KEY (`pickupSlotId`) REFERENCES `pickup_slots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_storeOfferId_fkey` FOREIGN KEY (`storeOfferId`) REFERENCES `store_offers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invite_tokens` ADD CONSTRAINT `invite_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

