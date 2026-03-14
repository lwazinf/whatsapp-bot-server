# Branding Context

## Two Layers of Branding

Omeru has two branding layers that stack together:

1. **Platform Branding** — global defaults that apply when no merchant context exists (e.g. customer home screen, system messages)
2. **Merchant Branding** — per-store overrides that apply in the context of a specific merchant's store, orders, and messages

---

## Platform Branding

### Source
Single record in `PlatformBranding` table. Retrieved via `getPlatformBranding(db)` which calls `findFirst()`.

### Fields

| Field | Default | Purpose |
|-------|---------|---------|
| `name` | `Omeru` | Platform display name |
| `logo_url` | — | Platform logo (used in platform-level messages) |
| `support_number` | — | Platform support WhatsApp number |
| `default_locale` | — | Fallback locale (e.g. `en-ZA`) |
| `default_currency` | — | Fallback currency (e.g. `ZAR`) |
| `message_footer` | — | Appended to platform-level messages |
| `switch_code` | `SwitchOmeru` | Keyword that opens the profile switcher |
| `platform_fee` | `0.05` (5%) | Commission percentage taken from merchant sales |
| `payout_day` | `Friday` | Day of weekly payouts to merchants |

### Where Platform Branding Is Used
- Currency formatting fallback when a merchant has no locale/currency set
- Platform fee display in merchant onboarding terms (Step 6)
- System-wide message templates (`buildMerchantWelcome`, `formatCurrency`)
- SwitchOmeru keyword recognition

### Configuring Platform Branding
Currently managed via direct database update. No admin UI yet.
- `PLATFORM_FEE_PERCENTAGE` env var sets the fee at server start (overrides DB default)

---

## Merchant Branding

### Source
`MerchantBranding` table — one record per merchant (1:1 relationship). Retrieved alongside merchant data.

### Fields

| Field | Purpose |
|-------|---------|
| `locale` | Override locale for this merchant (e.g. `en-ZA`, `en-US`) |
| `currency` | Override currency code (e.g. `ZAR`, `USD`) |
| `logo_url` | Merchant logo URL (shown in messages) |
| `primary_color` | Brand colour (reserved for future rich media / PDF receipts) |
| `message_footer` | Appended to merchant-sent messages |

### Additional Branding Fields on `Merchant`

| Field | Purpose |
|-------|---------|
| `brand_name` | Display/brand name (may differ from trading name) |
| `image_url` | Merchant profile image (fallback if no `welcome_image_url`) |
| `welcome_image_url` | Hero image shown to customer on first store visit |
| `welcome_message` | Custom text shown on first visit (used in `buildMerchantWelcome`) |
| `description` | Store bio / about |
| `support_number` | Merchant-specific support WhatsApp number |

### Merchant Branding in Customer-Facing Messages
When a customer is in a merchant context (browsing, cart, orders), all currency and locale formatting uses:
1. `merchantBranding.currency` / `merchantBranding.locale` → if set
2. `merchant.currency` / `merchant.locale` → fallback
3. `platformBranding.default_currency` / `platformBranding.default_locale` → final fallback

### Configuring Merchant Branding (via Settings)
Merchants edit their branding through `m_settings` → Profile submenu:

| Action | Setting changed |
|--------|----------------|
| 📝 Description | `Merchant.description` |
| 📸 Logo | `Merchant.image_url` |
| 📍 Address | `Merchant.address` |
| 🏷️ Brand Name | `Merchant.brand_name` |
| 💱 Currency | `MerchantBranding.currency` |
| 🌍 Locale | `MerchantBranding.locale` |
| ☎️ Support Number | `Merchant.support_number` |
| 👋 Welcome Message | `Merchant.welcome_message` |
| 🖼️ Welcome Image | `Merchant.welcome_image_url` |

---

## Customer-Facing Brand Touchpoints

### First Store Visit (Welcome Experience)
1. If `welcome_image_url` is set → send as image with `welcome_message` as caption
2. Else if `logo_url` or `image_url` set → send that image with welcome text
3. Else → send plain text welcome

Welcome text is built by `buildMerchantWelcome(merchant, platformBranding)` and includes:
- Store name, description, operating hours, address (if set)

Tracked via `MerchantCustomer.has_seen_welcome` — shown once per customer per store.

### Product Cards
- Each product card is an interactive image message (`sendInteractiveImageButtons`) when `product.image_url` is set
- Caption format: `🛍️ *Product Name*\nDescription\n💰 Price  •  Stock Status`
- Falls back to plain buttons message if no image

### Currency Formatting
`formatCurrency(amount, { merchant, merchantBranding, platform })`:
- Respects merchant locale and currency
- Falls back to platform defaults
- Example output: `R 149.99` (ZAR/en-ZA)

### Store Browse
- `show_in_browse: true` → store appears in Browse categories
- `show_in_browse: false` → store only accessible via direct `@handle` link (hidden from public discovery)

---

## Message Footer Stacking

Messages can carry footers at multiple levels:
1. `MerchantBranding.message_footer` → appended to merchant-context messages
2. `PlatformBranding.message_footer` → appended to platform-level messages

Footer content is optional and not currently auto-appended in code — reserved for future rich message templates.

---

## Browse Category Slugs (Platform-Level Store Categories)

These are the platform-defined categories merchants can assign their store to (`Merchant.store_category`):

| Slug | Emoji | Label |
|------|-------|-------|
| `food` | 🍔 | Food & Drink |
| `fashion` | 👗 | Fashion & Clothing |
| `beauty` | 💄 | Beauty & Wellness |
| `tech` | 💻 | Tech & Electronics |
| `home` | 🏠 | Home & Living |
| `services` | 🔧 | Services |
| `general` | 📦 | General |

- Only categories with at least one active, browse-visible store are shown in the browse menu.
- Empty categories are hidden from customers automatically.
- Product categories (within a store) are a merchant-side organisational tool only — not visible to customers as filters.
