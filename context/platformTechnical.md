# Platform Technical Context

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript (`npx tsx`) |
| Web framework | Express.js |
| ORM | Prisma |
| Database | PostgreSQL (hosted on Supabase) |
| WhatsApp API | 360Dialog (`D360-API-KEY` header) |
| Payment gateway | Ozow |
| Image storage | Cloudflare R2 |
| Cache / queue | Upstash Redis |
| Job scheduler | node-cron |
| Deployment | Railway |

Entry point: `src/index.ts`

---

## HTTP Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Railway health check |
| GET | `/api/whatsapp/webhook` | Webhook verification (`hub.challenge` + `hub.verify_token`) |
| POST | `/api/whatsapp/webhook` | Incoming WhatsApp messages |
| POST | `/webhook/ozow` | Ozow payment status callbacks |
| GET | `/payment/success` | Branded success page |
| GET | `/payment/cancel` | Payment cancelled page |
| GET | `/payment/error` | Payment error page |

### Webhook Message Structure

360Dialog wraps messages in Meta-style envelopes:
```
req.body.entry[0].changes[0].value.messages[0]
  OR (fallback)
req.body.messages[0]
```

Status updates (sent / delivered / read) arrive via `statuses` field and are logged but not acted on.

---

## Cron Jobs

| Schedule | Function | Purpose |
|----------|----------|---------|
| `*/5 * * * *` | `checkStaleOrders()` | Alert merchants at 10 min, customers at 60 min, auto-cancel at 75 min |

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8080` | Express server port |
| `DATABASE_URL` | — | Prisma connection (pooled) |
| `DIRECT_URL` | — | Prisma direct connection (for migrations) |
| `WHATSAPP_PHONE_NUMBER` | `27750656348` | Bot's WhatsApp number |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | — | Webhook security token |
| `ADMIN_WHATSAPP_NUMBER` | — | Single platform admin number |
| `PLATFORM_ADMIN_NUMBERS` | — | Comma-separated admin numbers (overrides single) |
| `OZOW_SITE_CODE` | `NEE-NEE-004` | Ozow merchant site code |
| `OZOW_PRIVATE_KEY` | — | Ozow SHA-512 signing key |
| `OZOW_API_KEY` | — | Ozow API key (header) |
| `OZOW_IS_TEST` | `true` | Ozow test mode flag |
| `OZOW_NOTIFY_URL` | — | Webhook callback URL for Ozow |
| `OZOW_SUCCESS_URL` | — | Payment success redirect |
| `OZOW_CANCEL_URL` | — | Payment cancel redirect |
| `OZOW_ERROR_URL` | — | Payment error redirect |
| `OZOW_SKIP_HASH_VERIFY` | — | Skip hash check in webhook (test only) |
| `PLATFORM_FEE_PERCENTAGE` | `0.05` | Platform commission (5%) |

> **Note:** `DIRECT_URL` does not connect from local machine. Use `migrate-new-fields.sql` for raw SQL migrations against Supabase. Run `npx prisma generate` locally (no DB needed). Run `npx prisma db push` from server.

---

## Database Schema — Key Models

### UserSession
```
wa_id               String  @id          — WhatsApp number (no + prefix)
mode                String               — CUSTOMER | MERCHANT | REGISTERING
state               String?              — JSON payload for active flow
active_prod_id      String?              — Current flow state key
active_merchant_id  String?              — FK: Merchant being managed
last_merchant_id    String?              — Last visited merchant (for opt-out)
cart_json           String?              — Serialised Cart object
has_seen_onboarding Boolean              — Customer intro shown once
delivery_address    String?              — Saved delivery address
```

### Merchant
```
id                  String   @id @default(cuid())
wa_id               String   @unique      — Primary owner's WhatsApp number
handle              String   @unique      — Public shop handle (e.g. bbqplace)
admin_handle        String   @unique      — Admin handle (e.g. bbqplace_admin)
trading_name        String
legal_entity_name   String?
id_number           String?              — FICA/compliance
bank_name, bank_acc_no, bank_type        — Payout details
description         String?
address             String?
image_url           String?
brand_name          String?
currency            String?
locale              String?
support_number      String?
welcome_message     String?
welcome_image_url   String?              — Hero image on store entry
open_time           String?              — Mon–Fri open (HH:MM)
close_time          String?
sat_open_time       String?
sat_close_time      String?
sun_open            Boolean @default(false)
manual_closed       Boolean @default(false)
accepted_terms      Boolean @default(false)
show_in_browse      Boolean @default(true)
status              MerchantStatus       — ONBOARDING | ACTIVE | SUSPENDED
store_category      String?              — Platform browse category slug
```

### Product
```
id              String   @id @default(cuid())
merchant_id     String
category_id     String?
name            String
description     String?
price           Float
image_url       String?
is_in_stock     Boolean
status          String               — DRAFT | ACTIVE | ARCHIVED
```

### ProductVariant
```
id          String  @id
product_id  String
size        String?
color       String?
sku         String?
price       Float
is_in_stock Boolean
```

### Order
```
id                  String  @id
customer_id         String               — wa_id (no + prefix)
merchant_id         String
total               Float
items_summary       String?
status              OrderStatus          — PENDING | PAID | READY_FOR_PICKUP | COMPLETED | CANCELLED
alert_count         Int     @default(0)
customer_alerted_at DateTime?
payment_ref         String?              — Ozow transactionReference
payment_url         String?              — Ozow hosted payment URL
createdAt           DateTime
```

### MerchantInvite
```
merchant_id      String
invited_wa_id    String  (stored with + prefix)
invited_by_wa_id String
role             String   @default("ADMIN")
status           String               — PENDING | ACCEPTED | REVOKED
short_code       String   @unique     — 6-char alphanumeric JOIN code
accepted_at      DateTime?
revoked_at       DateTime?
```

### MerchantOwner
```
merchant_id  String
wa_id        String
role         String               — OWNER | ADMIN | STAFF
is_active    Boolean
@@unique([merchant_id, wa_id])
```

### MerchantCustomer
```
merchant_id          String
wa_id                String
display_name         String?
last_interaction_at  DateTime
opt_out              Boolean  @default(false)
has_seen_welcome     Boolean  @default(false)
@@unique([merchant_id, wa_id])
```

### AuditLog
```
id           String   @id
actor_wa_id  String
action       String               — e.g. MERCHANT_FEEDBACK | CUSTOMER_FEEDBACK | PRODUCT_CREATED
entity_type  String
entity_id    String?
metadata_json Json?
createdAt    DateTime
```

### PlatformBranding (single record)
```
id               String  @id
name             String               — Platform display name (default: "Omeru")
logo_url         String?
support_number   String?
default_locale   String?
default_currency String?
message_footer   String?
switch_code      String               — Keyword to open profile switcher (default: "SwitchOmeru")
platform_fee     Float                — Commission rate (default: 0.05)
payout_day       String               — e.g. "Friday"
```

### MerchantBranding (1:1 with Merchant)
```
id              String  @id
merchant_id     String  @unique
locale          String?
currency        String?
logo_url        String?
primary_color   String?
message_footer  String?
```

---

## Session / State Pattern

| Field | Purpose |
|-------|---------|
| `active_prod_id` | Current multi-step flow state key (e.g. `OB_HRS_MF`, `SET_BIO`, `BROADCAST_MESSAGE`, `MERCHANT_FEEDBACK_MSG`, `ADDR_FLOW`, `cart_qty_{id}`) |
| `state` | JSON string payload for the current flow (data carried between steps) |
| `mode` | Current profile: `CUSTOMER` · `MERCHANT` · `REGISTERING` |
| `active_merchant_id` | Which merchant store is currently being managed |

State is cleared on Omeru command, on profile switch, or when a flow completes.

---

## Phone Number Normalisation

- WhatsApp `from` field arrives **without** `+` prefix (e.g. `27746854339`)
- `MerchantInvite.invited_wa_id` is stored **with** `+` prefix from admin input
- Always use `normalizePhone(p) = p.replace(/[^\d]/g, '')` before comparing numbers

---

## Payment Integration — Ozow

### Create Payment Request
```
POST https://api.ozow.com/PostPaymentRequest
Headers: ApiKey: {OZOW_API_KEY}

Transaction ref: OMERU-{orderId.slice(-8)}-{timestamp}   (max 50 chars)
Bank ref:        merchant trading name (first 20 chars)
Amount:          order.total.toFixed(2)

Hash field order (lowercase → SHA-512):
  SiteCode + CountryCode + CurrencyCode + Amount + TransactionRef +
  BankRef + CancelUrl + ErrorUrl + SuccessUrl + NotifyUrl + IsTest + PrivateKey

Returns: { paymentUrl, transactionRef }
```

### Ozow Webhook (`POST /webhook/ozow`)
1. Respond 200 immediately (prevent retries)
2. Verify SHA-512 hash (skip if `OZOW_SKIP_HASH_VERIFY=true`)
3. Look up order by `payment_ref = TransactionReference`
4. Handle status:
   - `Complete` → order PAID; notify customer + merchant
   - `Cancelled` / `Error` → order CANCELLED; offer Retry | My Orders buttons

### Webhook Hash Field Order (incoming)
```
SiteCode + TransactionId + TransactionRef + Amount + Status +
Optional1 + Optional2 + Optional3 + CurrencyCode + IsTest + StatusMessage + PrivateKey
→ lowercase → SHA-512
```
Compared against `body.Hash` or `body.HashCheck`.

---

## WhatsApp Messaging Constraints

- Interactive messages (buttons / lists) only work within the **24-hour customer service window**.
- Outbound to new users requires approved HSM templates (not currently configured).
- Workaround: `JOIN XXXXXX` codes for admin to share manually when bot cannot initiate first contact.

### Message Types in Use
| Function | Type | Max buttons/rows |
|----------|------|-----------------|
| `sendTextMessage` | Text | — |
| `sendButtons` | Interactive reply buttons | 3 |
| `sendListMessage` | Interactive list | 10 rows per section |
| `sendImageMessage` | Media + caption | — |
| `sendInteractiveImageButtons` | Media header + reply buttons | 3 |

---

## Key Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Express server, routes, cron, Ozow webhook |
| `src/lib/db.ts` | Prisma singleton |
| `src/services/whatsapp/handler.ts` | Main message router |
| `src/services/whatsapp/sender.ts` | WhatsApp API calls |
| `src/services/whatsapp/merchantEngine.ts` | Merchant command router |
| `src/services/whatsapp/merchantInventory.ts` | Product/category/variant management |
| `src/services/whatsapp/merchantKitchen.ts` | Order kitchen management |
| `src/services/whatsapp/merchantSettings.ts` | Store settings |
| `src/services/whatsapp/merchantDashboard.ts` | Dashboard display + stats |
| `src/services/whatsapp/merchantBroadcast.ts` | Customer broadcast |
| `src/services/whatsapp/customerDiscovery.ts` | Browse, store pages, cart, wishlist |
| `src/services/whatsapp/customerOrders.ts` | Order list and detail |
| `src/services/whatsapp/customerAddress.ts` | Address flow |
| `src/services/whatsapp/platformAdmin.ts` | Platform admin panel |
| `src/services/whatsapp/onboardingEngine.ts` | Merchant registration flow |
| `src/services/whatsapp/platformBranding.ts` | Platform branding helper |
| `src/services/whatsapp/messageTemplates.ts` | Currency formatter, welcome builder |
| `src/services/payments/ozow.ts` | Payment request + hash verification |
| `src/services/jobs/orderAlerts.ts` | Stale order cron logic |
| `prisma/schema.prisma` | Full DB schema |
| `migrate-new-fields.sql` | Raw SQL for schema additions |
