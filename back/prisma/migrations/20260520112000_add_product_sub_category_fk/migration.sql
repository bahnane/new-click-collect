-- AlterTable
ALTER TABLE `product_categories`
    ADD COLUMN `parentId` VARCHAR(191) NULL,
    ADD INDEX `product_categories_parentId_idx`(`parentId`);

-- AlterTable
ALTER TABLE `products`
    ADD COLUMN `subCategoryId` VARCHAR(191) NULL,
    ADD INDEX `products_subCategoryId_idx`(`subCategoryId`);

-- AlterTable
ALTER TABLE `product_submissions`
    ADD COLUMN `subCategoryId` VARCHAR(191) NULL,
    ADD INDEX `product_submissions_subCategoryId_idx`(`subCategoryId`);

-- AddForeignKey
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `product_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_subCategoryId_fkey` FOREIGN KEY (`subCategoryId`) REFERENCES `product_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_submissions` ADD CONSTRAINT `product_submissions_subCategoryId_fkey` FOREIGN KEY (`subCategoryId`) REFERENCES `product_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
