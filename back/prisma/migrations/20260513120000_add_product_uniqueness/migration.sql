-- Ensure catalog products are unique per category
CREATE UNIQUE INDEX `products_name_categoryId_key` ON `products`(`name`, `categoryId`);

-- Ensure one pending/approved/rejected submission per merchant+category+name+status
CREATE UNIQUE INDEX `product_submissions_merchantId_categoryId_name_status_key`
ON `product_submissions`(`merchantId`, `categoryId`, `name`, `status`);
