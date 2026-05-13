-- Migration: add pickupSlotCapacity to merchant_profiles + drop maxOrders from pickup_slots
ALTER TABLE `merchant_profiles` ADD COLUMN `pickupSlotCapacity` INTEGER NOT NULL DEFAULT 10;
ALTER TABLE `pickup_slots` DROP COLUMN `maxOrders`;
