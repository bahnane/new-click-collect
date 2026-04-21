-- CreateIndex
CREATE INDEX `store_offers_merchantId_createdAt_idx` ON `store_offers`(`merchantId`, `createdAt`);

-- CreateIndex
CREATE INDEX `orders_merchantId_createdAt_idx` ON `orders`(`merchantId`, `createdAt`);
