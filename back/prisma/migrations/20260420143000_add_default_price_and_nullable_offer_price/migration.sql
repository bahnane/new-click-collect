ALTER TABLE `products`
ADD COLUMN `priceInCents` INTEGER NULL;

ALTER TABLE `store_offers`
MODIFY `priceInCents` INTEGER NULL;
