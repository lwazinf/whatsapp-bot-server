# Profile Context — Definitions, Flows, Responsibilities & Relationships

## Profile Hierarchy

Omeru operates a three-tier privilege system. Every WhatsApp number has exactly one active profile at a time.

| Class | Profile | Switch Command | Reset Command |
|-------|---------|---------------|---------------|
| A | Platform Admin | `sw_admin` | `Omeru` → Admin menu |
| B | Merchant | `sw_merchant_{id}` | `Omeru` → Dashboard |
| C | Customer | `sw_customer` | — |

**Privilege isolation rules:**
- Commands and menus are strictly per-profile. No feature from a higher class leaks to a lower one.
- A customer who types a merchant command gets no response or a redirect to the customer home.
- A merchant in MERCHANT mode cannot access admin actions.
- Platform admins have all privileges but operate their own admin profile, not a customer profile.

---

## A — Platform Admin

### Identity
- Identified by `PLATFORM_ADMIN_NUMBERS` / `ADMIN_WHATSAPP_NUMBER` env var (comma-separated, normalised to digits-only).
- Any number in this list is recognised as a platform admin on every message.
- Additional admins can be added by updating the env var.

### Responsibilities
- Invite and manage merchant stores
- Activate, suspend, or unsuspend stores
- Revoke store owner or admin access
- Monitor feedback from merchants and customers
- View platform-wide store and invite data

### Admin Menu
Shown immediately on `sw_admin` or typing `admin`. No extra "Hi" step needed.

```
🛡️ Platform Admin
  Active stores: N | Onboarding: N | Pending invites: N

  [➕ Invite Store]  [🏪 Stores]  [📋 Invite History]
  [💬 Feedback Inbox]  [🗑️ Revoke Access]
```

### User Flow — Invite a Store
1. `pa_invite` → type store name (optionally append `| custom_handle`)
2. Type owner's phone number in E.164 format (`+27741234567`)
3. Bot attempts to send WhatsApp invite buttons to owner
4. If owner hasn't messaged the bot before, bot displays `JOIN XXXXXX` code for manual sharing
5. Invite is stored as PENDING in `MerchantInvite`

### User Flow — Manage Stores (`pa_stores`)
- Paginated list (8/page) with status icons: 🟢 ACTIVE · 🟡 ONBOARDING · 🔴 SUSPENDED
- Tap any store → detail view with: handle, admin_handle, status, browse visibility, admin count
- Actions: Activate | Suspend/Unsuspend | View Admins | View Invites

### User Flow — Feedback Inbox (`pa_feedback`)
- Landing screen shows 2 buttons with live message counts:
  - `🏪 Merchants (N)` → merchant feedback paginated (5/page)
  - `👤 Customers (N)` → customer feedback paginated (5/page)
- Each entry shows: sender name, date, message text

### Relationship to Merchants
- Admin creates and owns the invite lifecycle for every merchant.
- Admin can forcibly activate a store (bypassing normal first-product disclaimer flow).
- Admin can revoke any owner or admin's access to a store at any time.

---

## B — Merchant

### Identity
- A WhatsApp number associated with a `Merchant` record via `wa_id` (primary owner) or a `MerchantOwner` record (co-admin / staff).
- Mode set in `UserSession.mode = 'MERCHANT'` + `active_merchant_id` pointing to the managed store.
- A number can own/manage multiple stores and switch between them via SwitchOmeru list.

### Sub-roles within a store
| Role | Create/Invite | Edit Products | View Kitchen | Edit Settings | Billing |
|------|--------------|--------------|-------------|--------------|---------|
| OWNER | ✅ | ✅ | ✅ | ✅ | ✅ |
| ADMIN | — | ✅ | ✅ | Partial | — |
| STAFF | — | — | ✅ | — | — |

### Responsibilities
- Manage product inventory (add, edit, archive, variants)
- Manage categories for internal organisation
- Manage operating hours and shop open/closed state
- Operate the kitchen (accept, mark ready, complete orders)
- Broadcast messages to opted-in customers
- Configure branding, description, welcome image, support number
- Send feedback to platform admin

### Merchant Dashboard
Shown on `menu`, `home`, or `m_dashboard`. Opens automatically on profile switch.

```
🏪 Store Name  🟢 Open
━━━━━━━━━━━━━━━━━━━━
📅 Today
Orders: N  |  Pending: N
Revenue: R 0.00
━━━━━━━━━━━━━━━━━━━━

  [🍳 Kitchen (N)]  [📦 Products]  [🔒 Close Shop]
  [📊 Stats]  [📣 Broadcast]  [🛠️ Settings]
  [💬 Send Feedback]
```

### Key Flows
- **Kitchen**: View PENDING / PAID orders, mark ready, mark collected, cancel orders
- **Products**: Add product (4-step: name → category → price/description → image → preview/publish), edit, archive, variants
- **Settings**: Profile (bio, logo, address, brand name, currency, locale, support number, welcome message, welcome image), Hours, Handles, Team (add/remove owners), Browse visibility toggle
- **Broadcast**: Compose message → send to all opted-in customers for this store
- **Feedback**: 2-step — type message → saved to AuditLog; "Omeru" cancels

### Relationship to Customers
- Customers discover the merchant via Browse or `@handle` direct entry.
- Customers can opt out of merchant marketing (stored in `MerchantCustomer.opt_out`).
- Merchants cannot contact customers directly — only via broadcasts to opted-in subscribers.

### Relationship to Platform Admin
- Merchants are created and activated by the platform admin.
- Merchants can send feedback to the admin via the dashboard.
- Admin can suspend a store; suspended stores are invisible to customers.

---

## C — Customer

### Identity
- Any WhatsApp number that has not been identified as a merchant or platform admin, OR has explicitly switched to CUSTOMER mode.
- Session stored in `UserSession` with `mode = 'CUSTOMER'`.
- No registration required — customer profile is created on first message.

### Responsibilities
- Browse stores by category
- Visit individual stores via `@handle` or Browse
- Add products to cart, wishlist, or buy directly
- Complete checkout via Ozow payment link
- Manage orders (view, pay stale orders, cancel)
- Manage delivery address
- Manage wishlist

### Customer Home (First Visit)
On first "Hi": platform onboarding image + intro text + tip + 2 buttons.
```
[🛍️ Browse Stores]  [👤 My Account]
💡 Tip: Type @storename to visit any shop directly
```
`UserSession.has_seen_onboarding` prevents repeat on subsequent visits.

### Browse Flow
```
browse_shops
  → Category buttons (only categories with active stores shown)
      All Stores | Food & Drink | Fashion | Beauty | Tech | Home | Services | General
  → bcat_{slug}_{page}: 5 stores/page with handle text + nav buttons
  → @handle or sp_{handle}_{page}: store product page
```

### Store Product Page
- First visit: hero/welcome image + welcome text (tracked per merchant via `MerchantCustomer.has_seen_welcome`)
- 3 product cards per page as interactive image+buttons
- Navigation bar: ← Browse · 🔀 Sort · Next ▶ (or Prev)
- Sort: `ssort_{handle}` → list menu → `spf_{handle}.{sortCode}.{page}`
  - Sort codes: `new` · `old` · `lp` · `hp` · `az` · `za`

### Product Card Buttons
| State | Buttons |
|-------|---------|
| In stock, no variants | 🛒 Add to Cart · ⚡ Buy Now · 📖 More |
| In stock, has variants | 🛍️ Choose Option · ❤️ Wishlist |
| Out of stock | ❤️ Wishlist |

### Cart & Checkout Flow
1. Add to Cart → confirmation: "Product added! (N items in cart)" with Cart + Keep Shopping buttons
2. `c_cart` → cart summary with line items + total → [✅ Checkout]
3. Checkout → address check → Ozow payment link sent
4. On payment complete (Ozow webhook) → order status → PAID → customer + merchant notified

### Buy Now Flow
1. `buy_now_prod_{id}` / `buy_now_variant_{id}`
2. If no delivery address → `startAddressFlow(from, returnAction)` → address saved → resume
3. Creates PENDING order → Ozow payment link sent immediately

### My Account
```
[📦 My Orders]  [❤️ Wishlist]  [📍 My Address]
[⚙️ Settings & Help]
```

### Order States
| Status | Customer Action |
|--------|----------------|
| PENDING | Pay Now · Delete Order |
| PAID | View details |
| READY_FOR_PICKUP | View details |
| COMPLETED | View details |
| CANCELLED | View details |

### Customer Feedback (Reviews)
Feedback is **optional** and unobtrusive. It is triggered automatically at the natural end of an order, not as a primary action.

**When it appears:**
- When the merchant marks an order as **Collected** (→ COMPLETED), the customer immediately receives a completion message followed by a soft nav bubble: _"⭐ How was your experience? Rate your order from [Store] — it only takes a second."_ with a single `[⭐ Rate Experience]` button.
- On the order detail view (for COMPLETED orders), a second nav bubble also appears below the main action buttons — only if the order has not yet been rated.

**Flow:**
1. `cfb_start_{orderId}` → list of 5 star ratings
2a. Rating ≥ 3 → saved immediately (no comment prompt)
2b. Rating < 3 → optional comment prompt: "What could [store] do better?" with Skip button
3. Comment text or `cfb_skip_comment_{orderId}` → saved to `AuditLog`

**Visibility:**
- Merchant sees all reviews in Kitchen → "⭐ Reviews (N)" tab
- Low ratings (≤ 2 stars) trigger an immediate WhatsApp alert to the merchant
- Platform admin has legal/operational access via `AuditLog` (`action = 'CUSTOMER_FEEDBACK'`)

**AuditLog fields:** `order_id`, `merchant_id`, `merchant_name`, `customer_wa_id`, `rating`, `comment`, `order_total`, `feedback_submitted_at`

### Stale Order Handling
| Time | Event |
|------|-------|
| 10 min | Merchant alerted (up to 2 alerts) |
| 60 min | Customer alerted with Pay Now · Delete; merchant gets final warning |
| 75 min | Order auto-cancelled; customer notified |

---

## Profile Switching — SwitchOmeru

`SwitchOmeru` (or `sw_*` button IDs) shows a list of all available profiles for that number.

- Every number sees at least: Customer
- Numbers with a merchant record / owner role also see: each store they manage
- Platform admin numbers also see: Platform Admin

Switching immediately opens the destination profile's menu — no extra "Hi" or "menu" needed:
- `sw_admin` → Admin menu (handlePlatformAdminActions)
- `sw_merchant_{id}` → Merchant dashboard (handleMerchantAction with 'menu')
- `sw_customer` → Customer home (sendCustomerWelcome)

---

## Data Relationships at a Glance

```
PlatformAdmin (env number)
    │ invites
    ▼
MerchantInvite ──► Merchant ──► MerchantOwner (additional admins/staff)
                        │
                        ├──► Category ──► Product ──► ProductVariant
                        │
                        ├──► Order ──► OrderItem
                        │
                        ├──► MerchantCustomer (opt-in/out tracking per customer)
                        │
                        └──► MerchantBranding

UserSession (per WhatsApp number)
    ├── mode (CUSTOMER | MERCHANT | REGISTERING)
    ├── active_merchant_id → Merchant
    ├── cart_json (serialised cart)
    └── delivery_address

AuditLog (cross-profile event log)
    └── action: MERCHANT_FEEDBACK | CUSTOMER_FEEDBACK | PRODUCT_CREATED | ...

Wishlist ──► Product (customer-side)
```
