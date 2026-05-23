CREATE TABLE `image_assets` (
  `id` VARCHAR(191) NOT NULL,
  `storageProvider` VARCHAR(40) NOT NULL,
  `storageBucket` VARCHAR(120) NULL,
  `storageKey` VARCHAR(500) NOT NULL,
  `cdnUrl` VARCHAR(2048) NOT NULL,
  `mimeType` VARCHAR(120) NULL,
  `width` INTEGER NULL,
  `height` INTEGER NULL,
  `sizeBytes` INTEGER NULL,
  `checksumSha256` VARCHAR(128) NULL,
  `blurDataUrl` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `image_assets_storageKey_key`(`storageKey`),
  INDEX `image_assets_storageProvider_idx`(`storageProvider`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `image_asset_variants` (
  `id` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `variantKey` VARCHAR(80) NOT NULL,
  `storageKey` VARCHAR(500) NOT NULL,
  `cdnUrl` VARCHAR(2048) NOT NULL,
  `format` VARCHAR(20) NULL,
  `width` INTEGER NULL,
  `height` INTEGER NULL,
  `sizeBytes` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `image_asset_variants_assetId_variantKey_key`(`assetId`, `variantKey`),
  INDEX `image_asset_variants_assetId_idx`(`assetId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `product_categories`
  ADD COLUMN `imageAssetId` VARCHAR(191) NULL,
  ADD INDEX `product_categories_imageAssetId_idx`(`imageAssetId`);

ALTER TABLE `products`
  ADD COLUMN `imageAssetId` VARCHAR(191) NULL,
  ADD INDEX `products_imageAssetId_idx`(`imageAssetId`);

ALTER TABLE `image_asset_variants`
  ADD CONSTRAINT `image_asset_variants_assetId_fkey`
  FOREIGN KEY (`assetId`) REFERENCES `image_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `product_categories`
  ADD CONSTRAINT `product_categories_imageAssetId_fkey`
  FOREIGN KEY (`imageAssetId`) REFERENCES `image_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `products`
  ADD CONSTRAINT `products_imageAssetId_fkey`
  FOREIGN KEY (`imageAssetId`) REFERENCES `image_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
