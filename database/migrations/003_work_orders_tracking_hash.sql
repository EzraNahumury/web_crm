-- Migration: add tracking_hash to work_orders for unguessable tracking URLs
-- The tracking link now uses SHA-256(no_wo) so the URL slug is not the
-- predictable work order number. Existing WOs are backfilled below and
-- their orders.tracking_link is updated to the new hashed form.

ALTER TABLE `work_orders`
  ADD COLUMN `tracking_hash` VARCHAR(64) NULL UNIQUE AFTER `no_wo`;

-- Backfill: SHA2(no_wo, 256) gives a 64-char hex digest, matching what the
-- application computes via crypto.subtle.digest('SHA-256').
UPDATE `work_orders`
  SET `tracking_hash` = SHA2(`no_wo`, 256)
  WHERE `tracking_hash` IS NULL;

-- Replace existing /tracking/<no_wo> links with /tracking/<hash>.
UPDATE `orders` o
JOIN `work_orders` w ON w.order_id = o.id
SET o.tracking_link = CONCAT('/tracking/', w.tracking_hash)
WHERE w.tracking_hash IS NOT NULL
  AND o.tracking_link IS NOT NULL
  AND o.tracking_link LIKE '/tracking/%';
