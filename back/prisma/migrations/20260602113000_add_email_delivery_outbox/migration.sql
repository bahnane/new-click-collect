CREATE TABLE `email_deliveries` (
  `id` VARCHAR(191) NOT NULL,
  `template` ENUM(
    'MERCHANT_INVITATION',
    'PASSWORD_RESET',
    'CUSTOMER_EMAIL_VERIFICATION',
    'CUSTOMER_ORDER_PENDING',
    'MERCHANT_NEW_ORDER',
    'CUSTOMER_ORDER_STATUS'
  ) NOT NULL,
  `recipientEmail` VARCHAR(191) NOT NULL,
  `language` ENUM('fr', 'ar') NOT NULL DEFAULT 'fr',
  `payload` JSON NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `attemptCount` INTEGER NOT NULL DEFAULT 0,
  `maxAttempts` INTEGER NOT NULL DEFAULT 5,
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastAttemptAt` DATETIME(3) NULL,
  `sentAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `providerMessageId` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `email_deliveries_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
  INDEX `email_deliveries_nextAttemptAt_idx`(`nextAttemptAt`),
  INDEX `email_deliveries_template_createdAt_idx`(`template`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;