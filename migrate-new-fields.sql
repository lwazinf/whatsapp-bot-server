-- Customer experience overhaul migrations
-- Run against Supabase database after deploying

ALTER TABLE "UserSession"       ADD COLUMN IF NOT EXISTS "has_seen_onboarding" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MerchantCustomer"  ADD COLUMN IF NOT EXISTS "has_seen_welcome"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Merchant"          ADD COLUMN IF NOT EXISTS "store_category"      TEXT;
ALTER TABLE "Order"             ADD COLUMN IF NOT EXISTS "customer_alerted_at" TIMESTAMP;
ALTER TABLE "UserSession"      ADD COLUMN IF NOT EXISTS "delivery_address" TEXT;
ALTER TABLE "MerchantCustomer" ADD COLUMN IF NOT EXISTS "is_bookmarked"    BOOLEAN NOT NULL DEFAULT false;

-- Merchant onboarding overhaul (Mar 2026)
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "location_visible"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "onboarding_step"     TEXT;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "kyc_id_doc_url"      TEXT;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "kyc_bank_proof_url"  TEXT;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "kyc_submitted_at"    TIMESTAMP(3);
