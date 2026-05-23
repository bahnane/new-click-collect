-- Step 1: Migrate existing G rows to KG
UPDATE `products` SET `saleUnit` = 'KG' WHERE `saleUnit` = 'G';
UPDATE `product_submissions` SET `saleUnit` = 'KG' WHERE `saleUnit` = 'G';
UPDATE `order_items` SET `saleUnit` = 'KG' WHERE `saleUnit` = 'G';

-- Step 2: Modify enum columns to drop the G value
ALTER TABLE `products`
    MODIFY COLUMN `saleUnit` ENUM('KG','LITER','UNIT','PORTION') NOT NULL DEFAULT 'UNIT';

ALTER TABLE `product_submissions`
    MODIFY COLUMN `saleUnit` ENUM('KG','LITER','UNIT','PORTION') NOT NULL DEFAULT 'UNIT';

ALTER TABLE `order_items`
    MODIFY COLUMN `saleUnit` ENUM('KG','LITER','UNIT','PORTION') NOT NULL;

-- Step 3: Add maxOrderQty to store_offers
ALTER TABLE `store_offers`
    ADD COLUMN `maxOrderQty` DECIMAL(10,3) NULL;
