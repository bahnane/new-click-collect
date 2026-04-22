CREATE TABLE `merchant_opening_hours` (
  `id` VARCHAR(191) NOT NULL,
  `merchantId` VARCHAR(191) NOT NULL,
  `dayOfWeek` ENUM('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY') NOT NULL,
  `startHour` INTEGER NOT NULL,
  `endHour` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `merchant_opening_hours_merchantId_dayOfWeek_key`(`merchantId`, `dayOfWeek`),
  INDEX `merchant_opening_hours_merchantId_dayOfWeek_idx`(`merchantId`, `dayOfWeek`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `merchant_pickup_hours` (
  `id` VARCHAR(191) NOT NULL,
  `merchantId` VARCHAR(191) NOT NULL,
  `dayOfWeek` ENUM('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY') NOT NULL,
  `startHour` INTEGER NOT NULL,
  `endHour` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `merchant_pickup_hours_merchantId_dayOfWeek_key`(`merchantId`, `dayOfWeek`),
  INDEX `merchant_pickup_hours_merchantId_dayOfWeek_idx`(`merchantId`, `dayOfWeek`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `merchant_opening_hours`
  ADD CONSTRAINT `merchant_opening_hours_merchantId_fkey`
  FOREIGN KEY (`merchantId`) REFERENCES `merchant_profiles`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `merchant_pickup_hours`
  ADD CONSTRAINT `merchant_pickup_hours_merchantId_fkey`
  FOREIGN KEY (`merchantId`) REFERENCES `merchant_profiles`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
