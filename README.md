# Omeru — WhatsApp Commerce Platform

A multi-merchant shopping platform that runs entirely inside WhatsApp. Customers browse stores, add to cart, and pay without leaving the app. Merchants manage their entire store through conversation. No app downloads, no accounts, no friction.

---

## How It Works

Three distinct profiles share the same WhatsApp number space:

| Profile | Who | Access |
|---|---|---|
| **Customer** | Anyone who messages the bot | Default for all users |
| **Merchant** | Invited store owners & staff | After invite + onboarding |
| **Platform Admin** | Defined by `PLATFORM_ADMIN_NUMBERS` env var | Full platform visibility |

Type `SwitchOmeru` to switch between profiles you have access to.

---

## Customer Experience

**Discovering stores**
- Browse by category: All · Food & Drink · Fashion · Beauty · Tech · Home · Services
- Type `@storename` directly to visit any shop
- Sort products: Newest · Oldest · Price (low/high) · Name (A–Z / Z–A)

**Ordering**
- Add to cart (multi-item) or Buy Now (single-tap checkout)
- Save a delivery address once — reused on every order
- Pay via Ozow payment link sent in chat

**Order management**
- View recent orders via **My Orders**
- Pay a stale order or cancel before it's accepted
- Get notified when your order is ready for pickup
- Leave a star rating after collection — `[1-5] - optional comment`

**Account**
- Saved delivery address
- Wishlist
- Order history
- Opt out of merchant marketing at any time

---

## Merchant Experience

**Getting started**
1. Platform admin sends an invite → merchant accepts via WhatsApp or `JOIN XXXXXX` code
2. Complete 6-step onboarding: shop name → legal name → ID → bank details → hours → terms
3. Add first product → accept the going-live disclaimer → store is now active

**Daily operations (all via WhatsApp)**

| Area | What you can do |
|---|---|
| **Kitchen** | View new orders, mark ready, mark collected, cancel with customer notification |
| **Products** | Add, edit, archive products. Set name, price, description, image, category |
| **Variants** | Add size/colour/SKU/price variants to any product |
| **Settings** | Bio, logo, welcome image, address, trading hours, support number, welcome message |
| **Handles** | Change your public `@handle` and admin handle post-onboarding |
| **Team** | Invite co-owners and staff, remove admins |
| **Broadcast** | Message all opted-in customers at once |
| **Reviews** | See all customer star ratings and comments in Kitchen → Reviews |
| **Stats** | Today's orders, revenue, pending count from the dashboard |

**Order lifecycle**

```
PENDING → PAID → READY_FOR_PICKUP → COMPLETED
                                  ↘ CANCELLED
```

Merchant marks **Ready** → customer notified to collect
Merchant marks **Collected** → order completed, platform fee logged, customer prompted to rate

**Stale order handling**

| Time | Event |
|---|---|
| 10 min | Merchant alerted (up to 2 alerts) |
| 60 min | Customer alerted with Pay Now / Delete options |
| 75 min | Order auto-cancelled, customer notified |

---

## Platform Admin

Access from any number listed in `PLATFORM_ADMIN_NUMBERS` — type `admin`.

**Store management**
- Invite new stores with optional custom handle
- View all stores by status: 🟢 Active · 🟡 Onboarding · 🔴 Suspended
- Activate, suspend, or unsuspend stores
- Revoke full access or remove individual admins

**Feedback inbox**
- View merchant feedback messages
- View customer reviews (legal / operational access)

**Platform stats** (`pa_stats`)
- Store rankings by revenue and order count
- Peak activity hours and high-revenue time windows
- Category performance across all stores
- Activity by region
- Single-store drill-down with avg rating, top product, best day

**Invite system**
- Full invite history with status (pending / accepted / revoked)
- `JOIN XXXXXX` codes for invitees who haven't messaged the bot before

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript (`npx tsx`) |
| Framework | Express |
| Database | PostgreSQL via Prisma ORM (Supabase) |
| Cache | Upstash Redis |
| Image storage | Cloudflare R2 |
| WhatsApp API | 360Dialog (`D360-API-KEY`) |
| Payments | Ozow |
| Geocoding | OpenStreetMap Nominatim |

---

## Project Structure

```
src/
├── index.ts                          # Entry point + cron jobs
└── services/
    ├── whatsapp/
    │   ├── handler.ts                # Main message router
    │   ├── merchantEngine.ts         # Merchant command routing
    │   ├── merchantDashboard.ts      # Dashboard rendering
    │   ├── merchantInventory.ts      # Products, categories, variants
    │   ├── merchantKitchen.ts        # Order management + reviews
    │   ├── merchantSettings.ts       # Store settings
    │   ├── customerDiscovery.ts      # Browse, cart, buy-now, checkout
    │   ├── customerOrders.ts         # Order history, ratings, stale flow
    │   ├── customerAddress.ts        # Delivery address flow
    │   ├── onboardingEngine.ts       # 6-step merchant registration
    │   ├── platformAdmin.ts          # Admin panel + stats
    │   ├── platformBranding.ts       # Platform-level branding config
    │   ├── sender.ts                 # WhatsApp API wrappers
    │   └── messageTemplates.ts       # Shared message formatting
    └── payments/
        └── ozow.ts                   # Payment link generation + webhook
```

---

## Deployment

### 1. Deploy on Railway

1. Push this repo to GitHub
2. Railway → New Project → Deploy from GitHub repo
3. Railway auto-deploys on every push

### 2. Environment Variables

```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
WHATSAPP_API_KEY=...
WHATSAPP_API_URL=https://waba.360dialog.io
ADMIN_WHATSAPP_NUMBER=27741234567
PLATFORM_ADMIN_NUMBERS=27741234567
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

### 3. Configure Webhook

In the 360Dialog dashboard, add:
```
https://your-app.up.railway.app/api/whatsapp/webhook
```

### 4. Database Migration

Run `migrate-new-fields.sql` against your Supabase database after first deploy (SQL editor):

```sql
ALTER TABLE "UserSession"      ADD COLUMN IF NOT EXISTS "has_seen_onboarding" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSession"      ADD COLUMN IF NOT EXISTS "delivery_address" TEXT;
ALTER TABLE "MerchantCustomer" ADD COLUMN IF NOT EXISTS "has_seen_welcome" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Merchant"         ADD COLUMN IF NOT EXISTS "store_category" TEXT;
ALTER TABLE "Order"            ADD COLUMN IF NOT EXISTS "customer_alerted_at" TIMESTAMP;
```

---

## Key Commands

| Command | Who | What it does |
|---|---|---|
| `hi` | Customer | Home screen |
| `@storename` | Customer | Open a store directly |
| `SwitchOmeru` | Anyone | Switch between available profiles |
| `menu` | Merchant | Open merchant dashboard |
| `admin` | Platform Admin | Open admin panel |
| `JOIN XXXXXX` | Invited merchant | Accept invite by code |
| `stop` | Customer | Opt out of marketing from last store visited |

---

## Notes

- WhatsApp interactive messages (buttons/lists) only work within a 24-hour customer-initiated window
- Platform fee: **7%** of each completed order, logged on collection
- Browse visibility is per-store — hidden stores are still accessible via `@handle`
- Merchants can manage multiple stores; each appears as a separate option in `SwitchOmeru`
