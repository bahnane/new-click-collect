ALTER TABLE `product_submissions`
ADD COLUMN `imageAssetId` VARCHAR(191) NULL AFTER `name`;

CREATE INDEX `product_submissions_imageAssetId_idx`
ON `product_submissions`(`imageAssetId`);

ALTER TABLE `product_submissions`
ADD CONSTRAINT `product_submissions_imageAssetId_fkey`
FOREIGN KEY (`imageAssetId`) REFERENCES `image_assets`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;