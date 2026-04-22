CREATE UNIQUE INDEX `pickup_slots_merchantId_startsAt_endsAt_key`
ON `pickup_slots`(`merchantId`, `startsAt`, `endsAt`);
