ALTER TABLE `carts`
  DROP INDEX `carts_customerId_key`,
  ADD UNIQUE INDEX `carts_customerId_merchantId_key`(`customerId`, `merchantId`),
  ADD INDEX `carts_customerId_idx`(`customerId`);
