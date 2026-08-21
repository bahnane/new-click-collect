ALTER TABLE `merchant_profiles`
ADD COLUMN `changesRequestedReason` VARCHAR(2000) NULL AFTER `status`;