# Omeru — Comprehensive Project Context

> This document is the authoritative context file for the Omeru project. It covers product vision, architecture, flows, payment models, business model, and technical implementation in full. Use this as the primary reference for any AI-assisted development on this codebase.

---

## Table of Contents

1. [What is Omeru?](#1-what-is-omeru)
2. [Product Vision & Mission](#2-product-vision--mission)
3. [Technology Stack](#3-technology-stack)
4. [Architecture Overview](#4-architecture-overview)
5. [Database Schema](#5-database-schema)
6. [Platform Flows](#6-platform-flows)
   - 6.1 Customer Journey
   - 6.2 Merchant Journey
   - 6.3 Platform Admin Journey
7. [Module Reference](#7-module-reference)
8. [Messaging & WhatsApp Constraints](#8-messaging--whatsapp-constraints)
9. [Payment Model](#9-payment-model)
   - 9.1 Ozow Integration (Active)
   - 9.2 Payfast Integration (Planned)
   - 9.3 Transaction Flow
   - 9.4 Fee Structure
   - 9.5 Merchant Payouts
10. [Business Model](#10-business-model)
    - 10.1 Revenue Streams
    - 10.2 Merchant Tiers (Planned)
    - 10.3 Unit Economics
    - 10.4 Go-to-Market
11. [Session & State System](#11-session--state-system)
12. [Security Model](#12-security-model)
13. [Infrastructure & Deployment](#13-infrastructure--deployment)
14. [Environment Variables](#14-environment-variables)
15. [File Structure](#15-file-structure)
16. [Known Constraints & TODOs](#16-known-constraints--todos)

---

## 1. What is Omeru?

Omeru is a **WhatsApp-native multi-merchant e-commerce platform** built for the South African market. It enables small and medium businesses to sell products directly through WhatsApp — without needing a website, app, or POS system.

Customers discover stores, browse products, manage carts, and pay — all inside WhatsApp. Merchants manage their entire store — inventory, orders, settings, customers — through the same WhatsApp number. There is no web dashboard; WhatsApp IS the interface.

**Core premise**: In South Africa, WhatsApp is the most-used communication app, and most small businesses already sell via WhatsApp informally. Omeru formalises and scales this with payments, inventory management, and structured commerce flows.

---

## 2. Product Vision & Mission

**Mission**: Give every South African township business, food vendor, and informal trader a professional e-commerce presence in 60 seconds — without a smartphone beyond WhatsApp.

**Vision**: A single WhatsApp number that powers an entire marketplace ecosystem — where customers shop across any store and merchants run their business entirely from chat.

**Key differentiators**:
- Zero app downloads for customer or merchant
- Native WhatsApp UX (buttons, lists, images)
- Instant store setup via invite code
- Payments via Ozow (instant EFT, no card needed)
- Township & informal sector focus (Ozow supports EFT without credit cards)
- Multi-merchant discovery (browse stores by category)

---

## 3. Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| ORM | Prisma |
| Database | PostgreSQL via Supabase |
| Cache / Rate limiting | Upstash Redis |
| Image Storage | Cloudflare R2 |
| WhatsApp API | 360Dialog (WABA v2) |
| Payment Gateway (Primary) | Ozow (instant EFT) |
| Payment Gateway (Secondary) | Payfast (card, EFT, SnapScan, etc.) |
| Deployment | Koyeb (production server) |
| Local Runtime | `npx tsx` |

**Entry point**: `src/index.ts`
**Runtime command**: `npx tsx src/index.ts` (dev) / `node dist/index.js` (prod)

---

## 4. Architecture Overview

```
WhatsApp User
     │
     ▼
360Dialog API (WABA)
     │
     ▼ POST /api/whatsapp/webhook
Express Server (src/index.ts)
     │
     ▼
handleIncomingMessage() → handler.ts
     │
     ├─ isPlatformAdmin? → platformAdmin.ts
     ├─ mode=REGISTERING? → onboardingEngine.ts
     ├─ mode=MERCHANT? → merchantEngine.ts
     │       ├── merchantInventory.ts
     │       ├── merchantKitchen.ts
     │       ├── merchantSettings.ts
     │       ├── merchantBroadcast.ts
     │       └── merchantDashboard.ts
     └─ mode=CUSTOMER (default) → customerDiscovery.ts
             ├── customerOrders.ts
             └── customerAddress.ts

     ▼ POST /webhook/ozow
Payment webhook handler
     │
     ├── verifyHash()
     ├── updateOrderStatus(PAID)
     └── notifyCustomer + notifyMerchant

     ▼ Cron (every 5 min)
checkStaleOrders() → orderAlerts.ts
     ├── 10 min: alert merchant
     ├── 60 min: alert customer (Pay Now | Delete Order)
     └── 75 min: auto-cancel
```

### Core Routing Logic (handler.ts)

Messages are routed by matching `text` or button payload against known prefixes:

1. Global intercepts: `omeru`, `HelpOmeru`, `SWITCH`, `sw_*`
2. Invite responses: `accept_invite_*`, `decline_invite_*`, `JOIN xxxxxx`
3. Mode check: REGISTERING → onboarding; MERCHANT → merchant engine
4. Customer flows: `@handle`, `browse_shops`, `bcat_*`, `prod_*`, `buy_now_*`, etc.

---

## 5. Database Schema

### Core Models

#### UserSession
Tracks every WhatsApp user's state in real time.

| Field | Type | Purpose |
|-------|------|---------|
| `wa_id` | String (PK) | WhatsApp number without `+` |
| `mode` | Enum | CUSTOMER \| MERCHANT \| REGISTERING |
| `active_prod_id` | String? | Current multi-step flow key |
| `state` | String? | JSON payload for current flow |
| `active_merchant_id` | String? | Which store the user is managing |
| `last_merchant_id` | String? | Last visited merchant (opt-out tracking) |
| `cart_json` | String? | Serialized shopping cart |
| `has_seen_onboarding` | Boolean | First-visit platform intro shown |

#### Merchant
The core store/business entity.

| Field | Type | Purpose |
|-------|------|---------|
| `id` | String (PK) | UUID |
| `wa_id` | String | Owner's WhatsApp number |
| `handle` | String | @shopname (customer-facing) |
| `admin_handle` | String | @shopname_admin (merchant panel access) |
| `trading_name` | String | Display name |
| `legal_entity_name` | String? | Registered business name |
| `id_number` | String? | SA ID or CIPC number |
| `status` | Enum | ONBOARDING \| ACTIVE \| SUSPENDED |
| `manual_closed` | Boolean | Shop toggled closed without suspending |
| `show_in_browse` | Boolean | Visible in public store list |
| `welcome_image_url` | String? | Hero image on first visit |
| `welcome_message` | String? | Greeting when customer visits |
| `description` | String? | Store bio |
| `image_url` | String? | Store logo |
| `bank_name` | String? | Bank for payouts |
| `bank_acc_no` | String? | Account number (last 4 stored masked) |
| `bank_type` | String? | Cheque / Savings |
| `open_time` | String? | Mon-Fri open HH:MM |
| `close_time` | String? | Mon-Fri close HH:MM |
| `sat_open_time` | String? | Saturday open |
| `sat_close_time` | String? | Saturday close |
| `sun_open` | Boolean | Open Sundays |
| `currency` | String | ISO code, default "ZAR" |
| `locale` | String | Default "en-ZA" |
| `support_number` | String? | Customer service number |
| `category` | String? | Store category slug |

#### Order

| Field | Type | Purpose |
|-------|------|---------|
| `id` | String (PK) | UUID |
| `customer_id` | String | Customer WhatsApp number (no `+`) |
| `merchant_id` | String | FK to Merchant |
| `total` | Decimal | Order total in ZAR |
| `items_summary` | String | Human-readable item list |
| `status` | Enum | PENDING \| PAID \| READY_FOR_PICKUP \| COMPLETED \| CANCELLED |
| `payment_ref` | String? | Gateway transaction reference |
| `payment_url` | String? | Payment link sent to customer |
| `alert_count` | Int | Number of stale alerts sent |
| `customer_alerted_at` | DateTime? | When customer last received stale alert |
| `delivery_address` | String? | Customer delivery address |

#### Product / ProductVariant / Category
Standard e-commerce catalogue structure. Products belong to a Merchant via Category. Variants allow size/colour/SKU options with individual prices.

#### MerchantOwner
Grants access to merchant mode for a WhatsApp number.

| Field | Purpose |
|-------|---------|
| `role` | OWNER \| ADMIN \| STAFF |
| `is_active` | Soft delete — deactivating removes access |

#### MerchantInvite
Platform admin invites a new merchant. Contains `short_code` for `JOIN XXXXXX` flow.

#### MerchantCustomer
Tracks per-store engagement per customer.

| Field | Purpose |
|-------|---------|
| `opt_out` | Customer opted out of broadcasts |
| `has_seen_welcome` | First visit to store (controls hero image) |
| `is_bookmarked` | Customer saved this store |

#### AuditLog
Immutable event log for every significant action on the platform.

#### PlatformBranding
Global config: platform name, logo, support number, platform fee %, switch code.

---

## 6. Platform Flows

### 6.1 Customer Journey

```
1. First Message ("Hi")
   └─ Send Omeru onboarding image + intro text
      + [Browse Stores] [My Account] buttons
      └─ Flag: UserSession.has_seen_onboarding = true

2. Browse Stores
   └─ Category buttons: All | Food & Drink | Fashion | Beauty | Tech | Home | Services
      └─ Store list (text + pagination)
         └─ Tap @handle → Store page

3. Store Page (@handle or sp_{handle}_{page})
   ├─ First visit: send welcome_image_url + welcome_message
   │   └─ MerchantCustomer.has_seen_welcome = true
   └─ 3 products per page (interactive image cards)
      └─ Each card: image header + name/price + [Add to Cart] [❤️ Wishlist] [Buy Now]

4. Product Actions
   ├─ Add to Cart → qty selection → cart updated → back to store
   ├─ Wishlist → toggle on/off
   └─ Buy Now (single product) → PENDING Order → payment link sent

5. Cart Checkout
   ├─ View cart (c_cart) → line items + total
   ├─ Edit quantities
   ├─ Enter delivery address (ADDR_FLOW)
   └─ Confirm & Pay → PENDING Order → payment link sent

6. Payment (Payfast primary / Ozow secondary)
   ├─ Customer taps payment link → bank EFT or card
   ├─ Gateway webhook → /webhook/payfast or /webhook/ozow
   ├─ Order status → PAID (PayFast splits commission to Omeru at source)
   └─ WhatsApp: "Payment confirmed" to customer + "New order received" to merchant

7. Order Lifecycle (post-payment)
   ├─ Merchant marks READY_FOR_PICKUP → customer notified
   ├─ Merchant marks COMPLETED
   └─ (Or) Stale: 60 min alert → 75 min auto-cancel

8. Account (c_account)
   ├─ My Orders (c_my_orders)
   ├─ Wishlist (c_wishlist)
   ├─ Saved Stores (c_bookmarks)
   └─ My Address (c_address)
```

### 6.2 Merchant Journey

```
1. Invite Received
   └─ Platform admin sends invite (button or JOIN code)
      └─ Customer accepts → canAccessOnboarding() = true

2. Onboarding (REGISTERING mode) — 6 steps
   ├─ Step 1: Trading Name → auto-generate @handle
   ├─ Step 2: Legal Name
   ├─ Step 3: SA ID / CIPC Number
   ├─ Step 4: Bank Details (Bank, Account, Type)
   ├─ Step 5: Trading Hours (default or custom)
   └─ Step 6: Accept Terms → status = ACTIVE → Dashboard opens

3. Merchant Dashboard (mode=MERCHANT)
   ├─ [Inventory] [Kitchen] [Settings] [Broadcast] [Stats]
   └─ Quick open/close toggle

4. Inventory Management
   ├─ Add/edit/archive products
   ├─ Add categories
   ├─ Add product variants (size/colour/SKU)
   └─ Upload product images (→ Cloudflare R2)

5. Kitchen (Order Fulfillment)
   ├─ View new PENDING/PAID orders
   ├─ Mark order READY_FOR_PICKUP → customer notified
   └─ Cancel order

6. Settings
   ├─ Edit bio, logo, address, category, handles
   ├─ Set welcome image and message
   ├─ Manage trading hours
   ├─ Manage admin/staff access (invite by phone, revoke)
   └─ Toggle show_in_browse

7. Broadcast
   └─ Send bulk message to opted-in customers

8. Stats
   └─ Sales summary, recent orders, customer count
```

### 6.3 Platform Admin Journey

```
Admin message → isPlatformAdmin() = true → admin panel

├─ Invite Store
│   ├─ Input: store name (+ optional @handle)
│   ├─ Input: owner phone number (E.164)
│   └─ Creates Merchant (ONBOARDING) + MerchantInvite + short_code
│       └─ Tries WhatsApp button to invitee, falls back to JOIN code

├─ View Stores (pa_stores)
│   ├─ Paginated: 🟢 ACTIVE | 🟡 ONBOARDING | 🔴 SUSPENDED
│   └─ Tap store → detail (admins, invites, actions)

├─ Store Actions
│   ├─ Activate (ONBOARDING → ACTIVE)
│   ├─ Suspend / Unsuspend
│   ├─ Override status (force any → any)
│   ├─ Revoke admin access
│   └─ View/resend invites with short codes

├─ Feedback Inbox (pa_feedback)
│   └─ View MERCHANT_FEEDBACK + CUSTOMER_FEEDBACK from AuditLog

└─ Revoke Access
    └─ Disable MerchantOwner by admin_handle + phone
```

---

## 7. Module Reference

| File | Responsibility |
|------|---------------|
| `src/index.ts` | Express server, webhook routes, Ozow + Payfast webhooks, cron setup |
| `handler.ts` | Master message router, session management, command dispatch |
| `merchantEngine.ts` | Routes all MERCHANT mode sub-commands |
| `platformAdmin.ts` | Platform admin panel (invite, stores, override, feedback) |
| `onboardingEngine.ts` | 6-step merchant registration flow |
| `merchantSettings.ts` | Store profile, hours, handles, admin management |
| `merchantInventory.ts` | Products, categories, variants, images |
| `merchantKitchen.ts` | Order fulfillment (view, mark ready, cancel) |
| `merchantDashboard.ts` | Stats, overview, quick actions |
| `merchantBroadcast.ts` | Bulk messaging to opted-in customers |
| `merchantCustomers.ts` | Customer list and engagement tracking |
| `customerDiscovery.ts` | Browse stores, view products, cart, wishlist, bookmarks |
| `customerOrders.ts` | Order history, stale order handling |
| `customerAddress.ts` | Delivery address input flow |
| `sender.ts` | WhatsApp API wrapper (360Dialog) |
| `auditLog.ts` | Immutable event logging |
| `messageTemplates.ts` | Message formatters and text builders |
| `platformBranding.ts` | PlatformBranding config fetchers |
| `ozow.ts` | Ozow payment gateway (secondary EFT) |
| `payfast.ts` | PayFast payment gateway (primary — to implement) |
| `orderAlerts.ts` | Cron: stale order detection and alerting |
| `helpEngine.ts` | HelpOmeru command handler |
| `adminEngine.ts` | Admin action helpers |

---

## 8. Messaging & WhatsApp Constraints

### Interactive Message Window
- WhatsApp allows buttons/lists **only within 24 hours** of the last customer message (customer service window).
- After 24 hours, only plain text messages can be sent.
- Outbound to **new users** requires HSM (pre-approved message templates) — these are **not yet set up**.

### Workarounds in Use
- Invite flow falls back to `JOIN XXXXXX` code (customer types it → bot processes)
- Stale order alerts include plain-text payment links if outside window

### 360Dialog Pricing & Rate Limits

**Cost**: ~R1,000/month for **one WhatsApp number** — shared across the entire platform. Every merchant operates under the same number; routing is handled in code. This is Omeru's core cost leverage: fixed cost is flat while revenue scales with each store added.

**Meta Messaging Limits** (via 360Dialog):

| Tier | Unique Users / 24 hrs | How to Unlock |
|------|-----------------------|---------------|
| New portfolio | 250 | Default on signup |
| Tier 1 | 1,000 | Auto after hitting 50%+ usage with high quality score |
| Tier 2 | 10,000 | Auto after Tier 1 threshold |
| Unlimited | Unlimited | Meta Business Verification + sustained quality |

At 30 stores × 10 orders/day = 300 unique conversations/day → auto-upgrades past the 250 limit. Apply for **Meta Business Verification** via 360Dialog's partner-led flow as soon as real order volume exists — this unlocks limits faster than the automatic path.

**Post-July 2025 Billing (Per-Message, Not Per-Session)**:

| Message Type | Cost |
|---|---|
| Utility templates within open customer service window | **Free** |
| Utility templates outside the 24hr window | Charged (Meta rate card) |
| Marketing templates | Charged |
| Service messages (user-initiated, free-form replies) | **Free** |

Practical impact: Order confirmations, status updates, and receipts sent while the customer's conversation window is open cost nothing. This covers the vast majority of outbound messages in a normal ordering flow.

**When to add a second number**: At 100+ active stores, route by category (Number A: Food; Number B: Fashion). One number is sufficient until that scale.

### Sender Rate Limiting
- 150ms delay between outbound messages to prevent out-of-order delivery (WhatsApp FIFO per session)

### Phone Number Format Rules
- WhatsApp delivers `from` without `+` prefix: `27746854339`
- DB stores with `+` prefix when input by admin: `+27746854339`
- **All comparisons use `normalizePhone(p)` = `p.replace(/[^\d]/g, '')`**

### Message Types Used

| Type | Max Buttons | Use Case |
|------|-------------|---------|
| Text | - | Status updates, confirmations |
| Interactive Buttons | 3 | Main CTAs, confirmations |
| Interactive List | Many rows | Browse menus, option pickers |
| Image + Buttons | 3 | Product cards (interactive image buttons) |
| Plain Image | - | Logos, welcome images |

---

## 9. Payment Model

### 9.1 Gateway Strategy: Payfast Primary, Ozow Secondary

**Payfast is the primary payment gateway for Omeru.** It is the only South African gateway with a **native Split Payments** feature built for marketplaces — it instantly allocates commission and listing fees at transaction time, with splits configurable as a percentage or fixed amount. This solves the seller trust problem: money never "sits" with Omeru.

**Ozow is the secondary EFT option.** It is cheaper on EFT transactions but supports no cards. It is viable as an additional payment method once Payfast is live.

**Why not Stripe?** Stripe Connect is not natively available in South Africa. Routing through a workaround adds currency conversion friction and an extra 1.5% cross-border charge. Not suitable for a ZAR-only local marketplace.

**Peach Payments** is the upgrade path at enterprise scale (Real-Time Clearance payouts ~90 seconds to seller, strong fraud tooling).

### Gateway Comparison

| Gateway | Transaction Fee | Marketplace Splits | EFT | Cards | SA Native | Settlement |
|---|---|---|---|---|---|---|
| **PayFast** | 2.9% + R1.50 (card) / 2% + R2.00 (EFT) | ✅ Built-in, instant | ✅ | ✅ | ✅ | 1–2 business days |
| **Ozow** | 1.5%–2.5% (volume-tiered) | ❌ No native split | ✅ Only | ❌ | ✅ | Next business day |
| **Peach Payments** | 2.85% + R0.99 (card) / 1.5% + R1.50 (EFT) | ~ Via payout API | ✅ | ✅ | ✅ | ~90 sec (RTC) |
| **Stripe Connect** | 2.9% + $0.30 + 1.5% cross-border | ✅ Best-in-class | ❌ | ✅ | ❌ Not direct | 2–7 days (ZAR route) |

---

### 9.2 The Seller Trust Problem

The core seller fear: *"This platform will collect my money and I'll have to chase them for it."*

The actual Omeru model: *"Omeru routes the order. PayFast handles the money. You get paid directly."*

**How PayFast Split Payments solves this**:
1. Customer pays via PayFast on the Omeru WhatsApp bot
2. PayFast splits the payment automatically at transaction time:
   - **Seller receives** their portion directly into their PayFast account
   - **Omeru receives** the platform commission (deducted at source)
3. No money "sits" with Omeru — PayFast is the licensed payment processor

**Seller-facing one-liner**:
> *"When a customer pays, PayFast — South Africa's trusted payment processor — splits the payment instantly: your earnings settle to your account, and Omeru's platform fee is deducted at source. You're always in control of your money."*

**Seller onboarding flow (KYC)**:
1. Seller registers on Omeru and provides bank details + SA ID during onboarding
2. Omeru registers them as a PayFast sub-merchant
3. PayFast verifies them (KYC) and approves their settlement account
4. All future payments settle directly to their verified account

The KYC step is a **trust signal** — it signals the platform is formal and regulated, not informal.

---

### 9.3 Payfast Integration

**Supported payment methods**:
- Instant EFT (bank-direct, no card needed)
- Credit/debit cards (Visa, Mastercard)
- SnapScan
- Mobicred
- Payfast wallet

**Transaction fees**:
- Card: 2.9% + R1.50 per transaction
- Instant EFT: 2% + R2.00 minimum
- Payout withdrawal: R8.70 per disbursement

**Integration flow**:
1. Build signed PayFast payment request (all params + MD5 signature)
2. Send `payment_url` to customer via WhatsApp
3. Customer pays on PayFast-hosted page
4. PayFast fires ITN (Instant Transaction Notification) to `/webhook/payfast`
5. Omeru verifies signature + IP range → updates order → notifies parties

**Payfast ITN Statuses**:
| `payment_status` | Omeru Order Status |
|---|---|
| `COMPLETE` | PAID |
| `FAILED` | Remains PENDING |
| `CANCELLED` | Remains PENDING |

**Config** (env):
```
PAYFAST_MERCHANT_ID
PAYFAST_MERCHANT_KEY
PAYFAST_PASSPHRASE
PAYFAST_IS_SANDBOX     (true/false — false in production)
PAYFAST_NOTIFY_URL     → /webhook/payfast
PAYFAST_RETURN_URL     → /payment/success
PAYFAST_CANCEL_URL     → /payment/cancel
```

**Signature**: MD5 hash of all payment parameters (alphabetical order) + passphrase. ITN verified via Payfast's IP whitelist + signature check.

---

### 9.4 Ozow Integration (Active / Secondary EFT)

Ozow provides EFT-only payments (no cards). Lower transaction fees than Payfast on EFT. Useful for bank-direct customers.

**Transaction fees**: 1.5%–2.5% (volume tiered)

**How it works**:
1. Omeru calls `createPaymentRequest()` → Ozow API returns a `paymentUrl`
2. Customer opens link → selects bank → authenticates → EFT processed
3. Ozow sends webhook to `/webhook/ozow` with status + SHA-512 hash
4. Omeru verifies hash → updates order → notifies parties

**Transaction Reference Format**: `OMERU-{orderIdLast8}-{timestamp}`

**Hash Generation** (request):
```
SHA512(
  SiteCode + CountryCode + CurrencyCode + Amount + TransactionReference
  + BankReference + CancelUrl + ErrorUrl + SuccessUrl + NotifyUrl + IsTest
  + PrivateKey
).toLowerCase()
```

**Ozow Payment Statuses**:
| Ozow Status | Omeru Order Status |
|---|---|
| `Complete` | PAID |
| `Cancelled` | Remains PENDING (customer can retry) |
| `Error` | Remains PENDING (customer can retry) |
| `PendingInvestigation` | Remains PENDING (monitored) |

**Config** (env):
```
OZOW_SITE_CODE
OZOW_PRIVATE_KEY
OZOW_API_KEY
OZOW_IS_TEST           (set "false" for production)
OZOW_NOTIFY_URL        → /webhook/ozow
OZOW_SUCCESS_URL       → /payment/success
OZOW_CANCEL_URL        → /payment/cancel
OZOW_ERROR_URL         → /payment/error
OZOW_SKIP_HASH_VERIFY  (DEV ONLY — must remove in production)
```

**Retry Flow**: Customer can re-use the same `payment_url` on the Order, or trigger a fresh link via `pay_stale_{id}`.

---

### 9.5 Unified Transaction Flow

```
Customer confirms order
       │
       ▼
createPaymentRequest(gateway, orderId, amount)
       │
       ├─ PayFast → build MD5-signed URL → paymentUrl
       └─ Ozow → POST to api.ozow.com → paymentUrl
       │
       ▼
Order saved: status=PENDING, payment_ref=transRef, payment_url=link
       │
       ▼
sendTextMessage(customer, "Complete payment: {paymentUrl}")
       │
       ▼
Customer pays on gateway-hosted page
       │
       ▼
/webhook/{payfast|ozow} POST received
       │
       ├─ verifySignature() ← fail = 400, no update
       ├─ findOrder by payment_ref
       ├─ order.status = PAID
       ├─ PayFast split fires automatically (commission to Omeru, rest to merchant)
       ├─ notifyCustomer("Payment received! ✅")
       └─ notifyMerchant("New paid order #{orderId} — R{amount}")
       │
       ▼
Merchant: Kitchen → Mark READY_FOR_PICKUP → customer notified
       │
       ▼
Merchant: Mark COMPLETED
```

---

### 9.6 Fee Structure & Break-Even Analysis

**What actually happens on a R200 order (PayFast card)**:

| Line Item | Amount |
|---|---|
| Customer pays | R200.00 |
| PayFast gateway fee (2.9% + R1.50) | – R7.30 |
| Omeru platform commission (3.5%) | → R7.00 to Omeru |
| Seller receives via PayFast split | R192.70 |
| Omeru net after gateway cost | **R7.00 – R7.30 = –R0.30** ⚠️ |

**The break-even problem with low commission rates**:

PayFast's flat R1.50 fee dominates on small orders. At 2.5% commission:
- Break-even order value = **R292**
- Any order below R292 at 2.5% generates a net loss after gateway fees
- Minimum viable commission = **~3.75%** before WhatsApp or server costs

**Commission rate by order size**:

| Order Range | Recommended Commission | Reason |
|---|---|---|
| R0 – R100 | Minimum order floor | Gateway eats everything |
| R100 – R300 | 5% | Tight margin; EFT preferred |
| R300 – R1,000 | 3.5%–4% | Sweet spot — flat fee shrinks as % |
| R1,000+ | 2.5%–3% | High value; flat fee negligible |

> **Set a minimum order value of R100 in the bot flow.** This is the single fastest margin protection — zero added complexity.

---

### 9.7 Merchant Payouts

With PayFast Split Payments, the merchant's portion settles directly to their PayFast account at transaction time — no manual disbursement needed for the merchant share.

Omeru's platform commission portion settles to Omeru's PayFast account (1–2 business days).

**Schema for payout tracking** (to implement):
```prisma
model MerchantPayout {
  id           String   @id @default(uuid())
  merchant_id  String
  period_start DateTime
  period_end   DateTime
  gross_amount Decimal
  platform_fee Decimal
  gateway_fee  Decimal
  net_amount   Decimal
  status       String   // PENDING | PROCESSING | SENT | FAILED
  bank_ref     String?
  createdAt    DateTime @default(now())
}
```

---

## 10. Business Model

### 10.1 The Combined Model: Subscription + Commission

Every successful marketplace (Takealot, Uber Eats, Shopify) is built on this structure:
- **Subscription** covers fixed costs and guarantees baseline revenue regardless of GMV
- **Commission** scales with seller success — fully aligned incentives
- **Minimum order floor** protects against gateway fee erosion on micro-transactions

Neither alone is sufficient. Commission without subscription leaves you exposed to low-GMV periods. Subscription without commission leaves revenue on the table as stores grow.

---

### 10.2 SaaS Subscription Tiers

| | **Starter** | **Growth** | **Pro** |
|---|---|---|---|
| Price | R200/mo | R450/mo | R900/mo |
| Products | Up to 50 | Unlimited | Unlimited |
| Locations | 1 | 1 (priority listed) | Up to 3 |
| Commission rate | 3.5%–5% | 3% | 2.5% |
| Broadcasts | ❌ | ✅ Promo messages | ✅ Unlimited |
| Analytics | Monthly report | Weekly | Real-time dashboard |
| Support | Community | Email | Dedicated |
| Bot placement | Standard | Priority | Featured |

**Why tiered commission discounts work**: A Growth seller at R450/mo on R15,000/month GMV pays R450/mo in commission at 3% vs R525/mo at 3.5%. The commission saving (R75) partially offsets the subscription upgrade cost (R250 extra). This creates a rational self-selection into higher tiers for active sellers.

---

### 10.3 Revenue Streams

#### Stream 1: Platform Commission (Primary — per transaction)
- Deducted at source by PayFast Split Payments
- Scales directly with GMV
- Rate: 3.5%–5% depending on subscription tier

#### Stream 2: Subscription Fee (Foundation)
- Monthly recurring revenue regardless of GMV
- Covers fixed infrastructure costs
- Starter R200 / Growth R450 / Pro R900

#### Stream 3: Featured Listings (Planned)
- Merchants pay to appear at top of category browse pages
- ~R199/week per category, managed via platform admin

#### Stream 4: Omeru Ads (Long-term)
- Promoted product cards injected into browse feeds
- CPC or CPM model

#### Stream 5: Assisted Setup Fee (Optional)
- One-time onboarding support for merchants who need hands-on help
- ~R500 setup fee

---

### 10.4 Unit Economics & Break-Even

**Fixed Monthly Platform Costs**:

| Line Item | Monthly Cost |
|---|---|
| 360Dialog (1 WABA number) | R1,000 |
| Koyeb Pro (production server) | R540 |
| Supabase (DB, free tier) | R0 |
| Cloudflare R2 (storage, free tier) | R0 |
| Meta utility messages (in-window, free) | R0 |
| **Total fixed floor** | **R1,540 / mo** |

**Break-Even: 8 Stores at R200/mo**:
```
8 stores × R200 = R1,600 > R1,540 fixed costs
```
Every store from #9 onward is pure subscription profit before commission.

**Revenue Projection**:

| Stores | Sub Revenue | Est. Commission* | Fixed Costs | Net Profit |
|---|---|---|---|---|
| 5 | R1,000 | R750 | R1,540 | **–R290** |
| 8 | R1,600 | R1,200 | R1,540 | **+R1,260** |
| **15** | **R3,000** | **R2,250** | **R1,540** | **+R3,710** |
| 30 | R6,000 | R4,500 | R1,540 | **+R8,960** |
| 50 | R10,000 | R7,500 | R2,500** | **+R15,000** |

> *Commission estimated at 3.5% on avg R500 order, 3 orders/store/month (conservative).
> **Infra upgrade at 50+ stores (Koyeb Scale or Railway Pro).

**At 15 stores — the comfort zone**:
- Subscription alone: R3,000/mo
- Commission upside (conservative): R2,250/mo
- Total revenue: **R5,250/mo**
- Fixed costs: R1,540/mo
- **Net: R3,710/mo**

---

### 10.5 Infrastructure Scaling Roadmap

| Milestone | Action | Est. Cost |
|---|---|---|
| Now (0 sellers) | Koyeb free + 360Dialog. Build and test. | R0/mo |
| **3–5 sellers** | **Upgrade Koyeb → Pro. Non-negotiable before first paying seller.** | ~R540/mo |
| 8 sellers | Break-even on fixed costs. Start reinvesting in product. | — |
| 250+ msg/day | Apply for Meta Business Verification → unlock 1K daily limit. | Time-critical |
| 10+ sellers | Add BullMQ webhook queue (Redis). Move DB to Supabase Pro. | ~R1,200/mo |
| 50+ sellers | Koyeb Scale ($299) or Railway Pro. Horizontal autoscaling. | ~R5,500/mo |
| 100+ sellers | Add second 360Dialog WABA number. Route by category. | +R1,000/mo |

**Infrastructure philosophy**: Keep costs variable as long as possible. Sequence:
```
Free tier (dev) → Koyeb Pro (production) → Add Redis queue → Managed DB → Scale plan
```
Do not upgrade infrastructure ahead of seller count. Let seller revenue fund each step.

### Critical: Koyeb Cold Start Risk

On Koyeb **free tier**, the server enters Deep Sleep after 1 hour idle with a **1–5 second cold start**. PayFast fires its payment confirmation webhook immediately after a transaction. If the server is sleeping, the webhook fires into nothing — the customer gets no confirmation, the merchant doesn't know about it, and Omeru appears broken.

**This is a critical failure mode for a live payment platform.** Upgrade to **Koyeb Pro (~R540/mo)** before onboarding the first paying seller. This cost is recovered by the 3rd store subscription.

### Recommended: BullMQ Webhook Queue

Even on Koyeb Pro, implement a message queue between 360Dialog webhooks and processing logic:
```
360dialog webhook → BullMQ queue (Redis) → Worker processes order
```
Benefits: no dropped webhooks during traffic spikes, retries on failure, auditable order event log, decoupled response from payment processing. Stack: **BullMQ + Upstash Redis**.

---

### 10.6 Go-to-Market Strategy

**Phase 1 — Invite-Only Beta** (Current)
- Hand-pick 5–10 merchants in target verticals (food, fashion)
- Platform admin manually invites via `JOIN` code
- Gather feedback, fix pain points

**Phase 2 — Township Markets**
- Partner with established market organizers
- Bulk onboard vendors at markets (assisted setup)
- Customers shop via QR code → WhatsApp number

**Phase 3 — Self-Serve Growth**
- Allow merchants to register via WhatsApp without admin invite
- Referral program: merchant gets fee waiver for bringing a new merchant

**Phase 4 — Enterprise / Chain Stores**
- Multi-location merchants
- Franchise management
- API access for custom integrations

**Target Verticals** (priority):
1. Food & Drink (township food vendors, spazas, home cooks)
2. Fashion & Clothing (informal market traders)
3. Beauty & Wellness (home-based salons, lash techs, nail artists)
4. Services (plumbers, electricians — appointment + deposit booking)

---

### 10.7 Competitive Positioning

| Platform | Channel | Fees | Setup |
|---|---|---|---|
| Omeru | WhatsApp | 3.5%–5% + sub | Instant |
| Shopify | Web | 2% + R299+/mo sub | Days |
| WooCommerce | Web | Plugin fees | Technical |
| Yoco | In-person | 2.95% card | Hours |
| Takealot | Web | 15–25% commission | Weeks |
| WhatsApp Business (unofficial) | WhatsApp | Free (manual) | Instant |

**Omeru's advantage**: Zero setup friction + WhatsApp-native + payment-ready + marketplace discovery layer + formal PayFast settlement (trust signal).

---

## 11. Session & State System

Every WhatsApp user has a `UserSession` row. Multi-step flows use `active_prod_id` (the state key) and `state` (JSON payload).

### State Keys Reference

| `active_prod_id` | `state` payload | Flow |
|------------------|-----------------|------|
| `null` | `null` | Idle / command mode |
| `ADDR_FLOW` | `null` | Customer entering delivery address |
| `feedback_text_{orderId}` | `null` | Customer rating text input |
| `MERCHANT_FEEDBACK_MSG` | `null` | Merchant typing feedback to platform |
| `PA_INVITE_NAME` | `null` | Admin entering store name |
| `PA_INVITE_OWNER` | `{name, handle?}` | Admin entering owner phone |
| `OB_HRS_MF` | `null` | Onboarding: weekday hours input |
| `OB_HRS_SAT` | `null` | Onboarding: Saturday hours input |
| `SET_BIO` | `null` | Settings: editing bio |
| `SET_LOGO` | `null` | Settings: uploading logo |
| `SET_WELCOME_IMG` | `null` | Settings: uploading welcome image |
| `ADD_NAME` | `null` | Inventory: product name |
| `ADD_PRICE_{id}` | `{productId}` | Inventory: product price |
| `ADD_IMG_{id}` | `{productId}` | Inventory: product image |
| `cart_qty_{productId}` | `null` | Customer: editing cart quantity |
| `BROADCAST_MSG` | `null` | Merchant: typing broadcast message |

### Session Helpers

```typescript
setState(from, stateKey, payload)   // set active_prod_id + state JSON
clearState(from)                     // set both to null
getSessionPayload(from)              // parse session.state JSON
```

---

## 12. Security Model

### Authorization Layers

| Level | Check | Location |
|-------|-------|---------|
| Platform Admin | `isPlatformAdmin(waId)` — checks `PLATFORM_ADMIN_NUMBERS` env | `handler.ts` |
| Merchant Owner | `isAuthorizedOwner(waId, merchantId)` — checks `merchant.wa_id` OR `MerchantOwner.is_active` | `handler.ts` / `merchantEngine.ts` |
| Onboarding Access | `canAccessOnboarding(waId)` — checks PENDING/ACCEPTED invite | `handler.ts` |
| Invite Validity | `hasPendingInvite(waId)` — invite must be PENDING and not expired | `handler.ts` |

### Payment Security

- **Ozow webhook**: SHA-512 hash verification on every request. Reject if hash mismatch.
- **Payfast ITN** (planned): MD5 signature + IP whitelist verification.
- `OZOW_SKIP_HASH_VERIFY=true` — **DEV ONLY**. Must be removed/set to false in production.

### Data Security

- Bank account numbers: only last 4 digits stored in masked form after onboarding
- No PAN (credit card) numbers ever touch Omeru servers
- Payments handled externally by Ozow/Payfast; Omeru only stores transaction references

### Phone Number Normalization

Critical bug-prevention rule: **all phone comparisons must use `normalizePhone()`**.

```typescript
const normalizePhone = (p: string) => p.replace(/[^\d]/g, '')
```

Never compare raw WhatsApp `from` (no `+`) against DB values (with `+`) without normalizing both sides first.

---

## 13. Infrastructure & Deployment

### Production

| Service | Provider | Purpose |
|---------|---------|---------|
| Server | Koyeb Pro | Node.js runtime (Pro — no cold start) |
| Database | Supabase (PostgreSQL) | Primary datastore |
| Cache / Queue | Upstash Redis | Session rate limiting, BullMQ queuing |
| Images | Cloudflare R2 | Product image storage |
| WhatsApp API | 360Dialog | WABA messaging (~R1,000/mo) |
| Payments (Primary) | PayFast | Card + EFT + split payments for marketplace |
| Payments (Secondary) | Ozow | EFT-only, lower fee alternative |

### Local Development

```bash
npx tsx src/index.ts        # run dev server
npx prisma generate         # regenerate client (no DB connection needed)
npx prisma db push          # push schema changes (requires DB connection → use server)
```

**Important**: `DIRECT_URL` (Supabase direct connection) does **not** connect from local machine — always run `prisma db push` from the deployed server environment.

### Database Migrations

Omeru uses a hybrid migration approach:
- **Prisma schema changes**: Update `prisma/schema.prisma`
- **Raw SQL for deploy**: Write corresponding SQL in `migrate-new-fields.sql`
- Run raw SQL against Supabase directly via the dashboard or server

### Deployment Process

1. Push code to repo
2. Koyeb auto-deploys from main branch
3. Run `migrate-new-fields.sql` against Supabase if schema changed
4. Verify `/health` endpoint responds

---

## 14. Environment Variables

```bash
# ── WhatsApp (360Dialog) ───────────────────────────────────────────
WHATSAPP_API_URL="https://waba-v2.360dialog.io"
WHATSAPP_API_KEY="<360dialog-api-key>"
WHATSAPP_PHONE_NUMBER="27750656348"              # Bot's WhatsApp number (no +)
WHATSAPP_WEBHOOK_VERIFY_TOKEN="<token>"
WHATSAPP_PHONE_ID="<phone-id>"

# ── Database ───────────────────────────────────────────────────────
DATABASE_URL="postgresql://...?pgbouncer=true"   # Pooled (runtime)
DIRECT_URL="postgresql://..."                     # Direct (migrations — server only)

# ── Cache ──────────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="<token>"

# ── Image Storage (Cloudflare R2) ──────────────────────────────────
R2_ACCOUNT_ID="<id>"
R2_ACCESS_KEY_ID="<key>"
R2_SECRET_ACCESS_KEY="<secret>"
R2_BUCKET_NAME="product-images"
R2_PUBLIC_URL="https://pub-<id>.r2.dev"

# ── Auth ───────────────────────────────────────────────────────────
JWT_SECRET="<secret>"

# ── Payments: Ozow ────────────────────────────────────────────────
OZOW_SITE_CODE="<site-code>"
OZOW_PRIVATE_KEY="<private-key>"
OZOW_API_KEY="<api-key>"
OZOW_IS_TEST="true"                              # Set "false" for production
OZOW_NOTIFY_URL="https://<domain>/webhook/ozow"
OZOW_SUCCESS_URL="https://<domain>/payment/success"
OZOW_CANCEL_URL="https://<domain>/payment/cancel"
OZOW_ERROR_URL="https://<domain>/payment/error"
OZOW_SKIP_HASH_VERIFY="true"                     # DEV ONLY — remove in production

# ── Payments: Payfast (Planned) ───────────────────────────────────
PAYFAST_MERCHANT_ID="<id>"
PAYFAST_MERCHANT_KEY="<key>"
PAYFAST_PASSPHRASE="<passphrase>"
PAYFAST_IS_SANDBOX="true"                        # Set "false" for production
PAYFAST_NOTIFY_URL="https://<domain>/webhook/payfast"
PAYFAST_RETURN_URL="https://<domain>/payment/success"
PAYFAST_CANCEL_URL="https://<domain>/payment/cancel"

# ── Platform ───────────────────────────────────────────────────────
PLATFORM_FEE_PERCENTAGE="7"
ADMIN_WHATSAPP_NUMBER="27746854339"
PLATFORM_ADMIN_NUMBERS="27746854339"             # Comma-separated for multiple admins
PORT="8080"
```

---

## 15. File Structure

```
/whatsapp-bot-server
│
├── prisma/
│   └── schema.prisma                   Database schema (source of truth)
│
├── src/
│   ├── index.ts                        Express server, webhook routes, cron
│   ├── lib/
│   │   └── db.ts                       Prisma client singleton
│   └── services/
│       ├── payments/
│       │   ├── ozow.ts                 Ozow gateway (secondary EFT — active)
│       │   └── payfast.ts              PayFast gateway (primary — to implement)
│       │   └── payfast.ts              Payfast payment gateway (planned)
│       ├── jobs/
│       │   └── orderAlerts.ts          Stale order cron job
│       └── whatsapp/
│           ├── handler.ts              Master message router
│           ├── merchantEngine.ts       Merchant mode router
│           ├── platformAdmin.ts        Platform admin panel
│           ├── onboardingEngine.ts     6-step merchant registration
│           ├── merchantSettings.ts     Store profile & config
│           ├── merchantInventory.ts    Products, categories, variants
│           ├── merchantKitchen.ts      Order fulfillment
│           ├── merchantDashboard.ts    Stats & merchant overview
│           ├── merchantBroadcast.ts    Bulk customer messaging
│           ├── merchantCustomers.ts    Customer list & engagement
│           ├── customerDiscovery.ts    Browse, products, cart, wishlist
│           ├── customerOrders.ts       Order history & management
│           ├── customerAddress.ts      Delivery address flow
│           ├── sender.ts               WhatsApp API wrapper (360Dialog)
│           ├── auditLog.ts             Immutable event logging
│           ├── messageTemplates.ts     Message formatters
│           ├── platformBranding.ts     Global config helpers
│           ├── helpEngine.ts           HelpOmeru command
│           └── adminEngine.ts          Admin action helpers
│
├── context/                            AI context files (this file lives here)
│   ├── OMERU_PROJECT_CONTEXT.md        ← This file
│   ├── brandingContext.md
│   ├── onboardingContext.md
│   ├── overrideContext.md
│   ├── platformTechnical.md
│   ├── profileContext.md
│   └── statsContext.md
│
├── migrate-new-fields.sql              Raw SQL for DB schema additions
├── seed.ts                             DB seed data
├── package.json
├── tsconfig.json
└── .env                                Environment variables (never commit)
```

---

## 16. Known Constraints & TODOs

### Active Constraints

| Constraint | Detail |
|-----------|--------|
| No outbound HSM templates | Cannot initiate conversations with new users — requires `JOIN` code workaround |
| Interactive message 24h window | Buttons/lists only work within service window |
| Local DB access | `DIRECT_URL` doesn't work from local machine — schema pushes must run on server |
| Ozow hash verification disabled | `OZOW_SKIP_HASH_VERIFY=true` in dev — must be removed before going live |
| Ozow test mode active | `OZOW_IS_TEST=true` — must flip to `false` for production |
| PayFast not yet integrated | Split Payments are the target architecture but not yet coded |
| Sub-merchant KYC not wired | Merchant PayFast sub-merchant registration not yet implemented |
| BullMQ queue not implemented | Webhooks processed synchronously — no retry on failure |
| Koyeb free tier in use | Cold start risk — must upgrade to Pro before first live seller |

### Priority Action List (Ordered by Urgency)

1. **Set minimum order of R100** in the bot flow — zero complexity, immediate margin protection
2. **Upgrade Koyeb to Pro (~R540/mo)** — non-negotiable before first paying seller; eliminates cold start that kills payment webhooks
3. **Add BullMQ + Redis webhook queue** — prevents dropped webhooks; retryable + auditable
4. **Integrate PayFast Split Payments** — primary gateway; replaces manual payout model
5. **Apply for Meta Business Verification** via 360Dialog at 30+ active daily conversations
6. **Contact PayFast** to confirm sub-merchant KYC requirements before first live seller
7. **Add Ozow as secondary EFT option** once PayFast is stable — captures EFT-preferring customers at lower fee

### Planned Features

| Feature | Priority | Notes |
|---------|----------|-------|
| PayFast integration + Split Payments | Critical | Primary gateway; sub-merchant KYC flow |
| BullMQ webhook queue | Critical | Reliability before going live |
| Koyeb Pro upgrade | Critical | Before first paying seller |
| Minimum order R100 floor | High | Immediate margin protection |
| Merchant subscription billing | High | R200 / R450 / R900 tiers in bot flow |
| Meta Business Verification | High | Unlock messaging rate limits |
| Self-serve merchant registration | Medium | Remove admin invite requirement |
| HSM message templates | Medium | Outbound notifications to new users |
| Featured listings | Low | Monetisation of browse placement |
| Multi-language support | Low | Zulu, Xhosa, Afrikaans |
| Web admin dashboard | Low | Mirror of WhatsApp admin in browser |
| Delivery integration | Low | Pargo, Pudo, courier partnerships |

### Technical Debt

- `OZOW_SKIP_HASH_VERIFY` must be removed before production payment launch
- `OZOW_IS_TEST` must be set to `false` for production
- Merchant bank details should be encrypted at rest (currently stored as-is, last 4 only for account numbers)
- `cart_json` in UserSession is a stringly-typed JSON blob — candidate for a proper Cart model
- Order `customer_id` is not a FK to UserSession — intentional but limits relational queries

### Key Numbers Reference

| Item | Value |
|---|---|
| PayFast card fee | 2.9% + R1.50 |
| PayFast EFT fee | 2% + R2.00 minimum |
| PayFast payout withdrawal | R8.70 |
| Ozow EFT fee | 1.5%–2.5% (volume tiered) |
| 360Dialog WABA (1 number) | ~R1,000/mo |
| Koyeb Pro | ~R540/mo (~$29) |
| Commission break-even order (2.5%) | R292 |
| Commission break-even order (3.5%) | R209 |
| Platform fixed cost floor | R1,540/mo |
| Stores to break even (R200 sub) | 8 stores |
| Stores to reach R3,700+ net profit | 15 stores |
| Meta messaging limit (new portfolio) | 250 unique users/day |
| Meta messaging limit (after verification) | 1,000 → 10,000 → unlimited |

---

*Last updated: March 2026 | Context maintained for AI-assisted development on the Omeru codebase*
