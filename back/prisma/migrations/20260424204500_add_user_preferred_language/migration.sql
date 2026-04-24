-- AlterTable
ALTER TABLE `users`
  ADD COLUMN `preferredLanguage` ENUM('fr', 'ar') NOT NULL DEFAULT 'fr';