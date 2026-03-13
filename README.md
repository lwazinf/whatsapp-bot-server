# 🚀 Omeru WhatsApp Commerce Platform

WhatsApp-native multi-merchant shopping platform. Customers browse stores, add to cart, and pay — all without leaving WhatsApp.

## ✨ Features

### Customer
- 🛍️ Browse stores by category (Food, Fashion, Beauty, Tech, Home, Services)
- 🛒 Cart with multi-item checkout and quantity editing
- ⚡ Buy Now — single-tap purchase bypassing cart
- ❤️ Wishlist
- 📍 Saved delivery address (location pin or typed, geocoded via Nominatim)
- 📦 Order tracking and payment retry

### Merchant
- 🏪 Full store management via WhatsApp: profile, hours, logo, welcome image
- 📦 Product/category/variant inventory management
- 🍳 Kitchen view: new → ready → collected order flow + order cancellation
- 👥 Multi-owner support with invite codes
- 🔗 Change @handle and @admin_handle post-onboarding
- 📢 Browse visibility toggle

### Platform Admin
- ➕ Invite new stores (with custom handle support and conflict detection)
- 🟢 Activate stores from ONBOARDING → ACTIVE
- 🔴 Suspend / unsuspend stores (merchant notified)
- 👥 Revoke admin access per store
- 📋 Full invite history

### Payments
- 💳 Ozow payment gateway (direct link in chat)
- ⏱️ Stale order alerts at 60 min, auto-cancel at 75 min

## 🛠️ Tech Stack

- **Server:** Node.js + Express + TypeScript (`npx tsx`)
- **Database:** PostgreSQL via Prisma ORM (Supabase)
- **Cache:** Upstash Redis
- **Images:** Cloudflare R2
- **WhatsApp:** 360Dialog API (`D360-API-KEY` header)
- **Geocoding:** OpenStreetMap Nominatim (reverse geocode for delivery addresses)

## 📁 Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point |
| `src/services/whatsapp/handler.ts` | Main message router |
| `src/services/whatsapp/merchantEngine.ts` | Merchant command routing |
| `src/services/whatsapp/customerDiscovery.ts` | Browse, cart, buy-now, checkout |
| `src/services/whatsapp/customerAddress.ts` | Delivery address flow |
| `src/services/whatsapp/merchantSettings.ts` | Store settings |
| `src/services/whatsapp/merchantKitchen.ts` | Order management |
| `src/services/whatsapp/platformAdmin.ts` | Platform admin panel |
| `src/services/whatsapp/onboardingEngine.ts` | 6-step merchant registration |
| `src/services/payments/ozow.ts` | Ozow payment integration |

## 🚀 Deploy to Railway

### 1. Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-bot-server.git
git push -u origin main
```

### 2. Deploy on Railway

1. Go to https://railway.app/ → Login with GitHub
2. New Project → Deploy from GitHub repo → select this repo
3. Railway auto-deploys on push

### 3. Add Environment Variables

In Railway → Variables → Raw Editor:

```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...          # Supabase direct URL
WHATSAPP_API_KEY=...                 # 360Dialog D360-API-KEY
WHATSAPP_API_URL=https://waba.360dialog.io
ADMIN_WHATSAPP_NUMBER=27741234567
PLATFORM_ADMIN_NUMBERS=27741234567   # comma-separated
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_ENDPOINT=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
OZOW_SITE_CODE=...
OZOW_PRIVATE_KEY=...
OZOW_API_KEY=...
```

### 4. Configure Webhook

In 360Dialog dashboard:
- Webhooks → Add: `https://your-app.up.railway.app/api/whatsapp/webhook`

### 5. Run Database Migration

After first deploy, run `migrate-new-fields.sql` against your Supabase database (via SQL editor):

```sql
-- adds fields not yet in the managed migration history
ALTER TABLE "UserSession" ADD COLUMN IF NOT EXISTS "has_seen_onboarding" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MerchantCustomer" ADD COLUMN IF NOT EXISTS "has_seen_welcome" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "store_category" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customer_alerted_at" TIMESTAMP;
ALTER TABLE "UserSession" ADD COLUMN IF NOT EXISTS "delivery_address" TEXT;
```

## 📱 How It Works

### Customer flow
1. Message the bot → Omeru welcome screen
2. **Browse Stores** → category filter → store list → product cards
3. **Add to Cart** or **Buy Now** → address shown in checkout → Ozow payment link
4. Order tracked in **My Orders**; **My Address** saves delivery info for next time

### Merchant flow
1. Admin invites store → merchant types `JOIN XXXXXX` or accepts WhatsApp invite
2. Completes 6-step onboarding via `@{store}_admin`
3. Admin activates store → `menu` to manage products, orders, settings

### Platform Admin
- Message `admin` from a number in `PLATFORM_ADMIN_NUMBERS`
- Stores → tap store → Activate / Suspend
- Invite Store: `Store Name | optionalhandle` → owner's phone number

## 🔑 User Commands

| Command | Action |
|---|---|
| `hi` / `hello` | Home screen |
| `@{handle}` | Open a store |
| `@{store}_admin` | Open merchant dashboard |
| `JOIN XXXXXX` | Accept invite by code |
| `admin` | Platform admin panel (admins only) |
| `switch` / `SwitchOmeru` | Switch between customer/merchant/admin mode |
| `HelpOmeru` | Help menu |
| `stop` | Opt out of merchant marketing |

## 📄 License

MIT
