-- AlterTable
ALTER TABLE `merchant_profiles` ADD COLUMN `businessType` ENUM('HANOUTE', 'PATISSERIE') NOT NULL;

-- AlterTable
ALTER TABLE `products` ADD COLUMN `categoryId` VARCHAR(191) NOT NULL;

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

-- CreateIndex
CREATE INDEX `merchant_profiles_businessType_idx` ON `merchant_profiles`(`businessType`);

-- CreateIndex
CREATE INDEX `products_categoryId_idx` ON `products`(`categoryId`);

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `product_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
