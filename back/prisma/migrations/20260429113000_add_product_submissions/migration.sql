-- CreateTable
CREATE TABLE `product_submissions` (
    `id` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `saleUnit` ENUM('KG', 'G', 'LITER', 'UNIT', 'PORTION') NOT NULL DEFAULT 'UNIT',
    `priceInCents` INTEGER NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `rejectionReason` VARCHAR(500) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewedByUserId` VARCHAR(191) NULL,
    `approvedProductId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `product_submissions_merchantId_status_idx`(`merchantId`, `status`),
    INDEX `product_submissions_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `product_submissions_categoryId_idx`(`categoryId`),
    INDEX `product_submissions_reviewedByUserId_idx`(`reviewedByUserId`),
    INDEX `product_submissions_approvedProductId_idx`(`approvedProductId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_submissions` ADD CONSTRAINT `product_submissions_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `merchant_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_submissions` ADD CONSTRAINT `product_submissions_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `product_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_submissions` ADD CONSTRAINT `product_submissions_reviewedByUserId_fkey` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_submissions` ADD CONSTRAINT `product_submissions_approvedProductId_fkey` FOREIGN KEY (`approvedProductId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
