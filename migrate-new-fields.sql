-- Customer experience overhaul migrations
-- Run against Supabase database after deploying

ALTER TABLE "UserSession"       ADD COLUMN IF NOT EXISTS "has_seen_onboarding" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MerchantCustomer"  ADD COLUMN IF NOT EXISTS "has_seen_welcome"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Merchant"          ADD COLUMN IF NOT EXISTS "store_category"      TEXT;
ALTER TABLE "Order"             ADD COLUMN IF NOT EXISTS "customer_alerted_at" TIMESTAMP;
