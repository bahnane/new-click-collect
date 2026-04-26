ALTER TABLE `merchant_profiles`
  ADD COLUMN `slug` VARCHAR(140) NOT NULL;

CREATE UNIQUE INDEX `merchant_profiles_slug_key`
  ON `merchant_profiles`(`slug`);
