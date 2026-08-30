CREATE TABLE `business_types` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `business_types_code_key`(`code`),
    INDEX `business_types_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `business_types` (`id`, `code`, `createdAt`, `updatedAt`) VALUES
    ('business-type-hanoute', 'HANOUTE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('business-type-patisserie', 'PATISSERIE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

ALTER TABLE `merchant_profiles`
    ADD COLUMN `businessTypeId` VARCHAR(191) NULL;

UPDATE `merchant_profiles`
SET `businessTypeId` = CASE `businessType`
    WHEN 'HANOUTE' THEN 'business-type-hanoute'
    WHEN 'PATISSERIE' THEN 'business-type-patisserie'
END;

ALTER TABLE `merchant_profiles`
    MODIFY `businessTypeId` VARCHAR(191) NOT NULL,
    DROP INDEX `merchant_profiles_businessType_idx`,
    DROP COLUMN `businessType`,
    ADD INDEX `merchant_profiles_businessTypeId_idx`(`businessTypeId`),
    ADD CONSTRAINT `merchant_profiles_businessTypeId_fkey`
        FOREIGN KEY (`businessTypeId`) REFERENCES `business_types`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `business_type_categories` (
    `businessTypeId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`businessTypeId`, `categoryId`),
    INDEX `business_type_categories_categoryId_idx`(`categoryId`),
    CONSTRAINT `business_type_categories_businessTypeId_fkey`
        FOREIGN KEY (`businessTypeId`) REFERENCES `business_types`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `business_type_categories_categoryId_fkey`
        FOREIGN KEY (`categoryId`) REFERENCES `product_categories`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `business_type_categories` (`businessTypeId`, `categoryId`)
SELECT `business_types`.`id`, `product_categories`.`id`
FROM `business_types`
CROSS JOIN `product_categories`
WHERE `product_categories`.`parentId` IS NULL;