# Omeru WhatsApp Bot — Commands & Tutorial

> All interactions happen via WhatsApp message to the bot number.
> The bot has three profiles: **Customer**, **Merchant**, and **Platform Admin**.
> Type `SwitchOmeru` to see a menu of available modes.
> Type `HelpOmeru` at any time to see commands available for your profile.

---

## Profile 1 — Customer

This is the default profile for anyone who messages the bot.

### Commands

| Message | What it does |
|---|---|
| `hi` | Shows the welcome menu |
| `browse_shops` | Lists all shops that have enabled browse visibility |
| `@shopname` | Opens a specific shop's menu |
| `c_my_orders` | Shows your 5 most recent orders |
| `stop` / `unsubscribe` / `opt-out` | Opt out of marketing messages from the last shop you visited |
| `SwitchOmeru` | Show mode switcher (Customer / Merchant / Admin) |
| `HelpOmeru` | Show all commands for your profile |

### Tutorial — Browsing & Ordering

1. Send `hi` → tap **Browse Shops**
2. Tap a shop from the list, or type `@shopname` directly
3. Browse categories → select a category → select a product
4. If the product has variants (size, colour), choose one
5. Follow the checkout prompts
6. Track your order by sending `c_my_orders`

**Order statuses:**
- 🟡 Pending — shop received your order
- 🟢 Paid — payment confirmed
- ✅ Ready for Pickup — come collect
- 🎉 Completed — done
- ❌ Cancelled

---

## Profile 2 — Merchant

Switch to this profile using `SwitchOmeru`. You must have a registered store.

### Dashboard

| Message | What it does |
|---|---|
| `menu` / `home` / `m_dashboard` | Opens the merchant dashboard |
| `m_stats` | Sales total, pending orders, active products, recent orders |
| `SwitchOmeru` | Show mode switcher |
| `HelpOmeru` | Show all commands for your profile |

### Kitchen (Orders)

| Message | What it does |
|---|---|
| `m_kitchen` | Kitchen overview — new vs ready orders |
| `k_new` | View all pending/paid orders |
| `k_ready` | View orders ready for pickup |

**Order actions** (shown as buttons on each order):
- **Mark Ready** — notifies the customer their order is ready
- **Mark Collected** — completes the order, notifies customer, logs platform fee

### Menu / Inventory

| Message | What it does |
|---|---|
| `m_inventory` | Menu manager — view counts, access all product tools |
| `p_view_all` | View all active products |
| `m_add_prod` | Start adding a new product |
| `m_categories` | Manage categories |
| `m_archived` | View archived products |

**Adding a product — 4 steps:**
1. Send `m_add_prod` → type the product name
2. Choose or create a category (or skip)
3. Enter the price (e.g. `45.50`)
4. Send a photo or tap **Skip** → tap **Make Live**

**Product actions** (from the product detail view):
- Toggle In Stock / Out of Stock
- Edit Name, Price, Description, Image
- Archive (soft delete)
- Change category
- Add/edit/delete variants (size, colour, SKU, price)

**Adding variants:**
1. Select a product → tap **Variants** → tap **Add Variant**
2. Enter size → colour → SKU → price (type `skip` to skip any field)

### Settings

| Message | What it does |
|---|---|
| `m_settings` | Opens settings menu |
| `s_profile` | Edit profile sub-menu |
| `s_hours` | View and edit trading hours |
| `s_toggle` | Toggle shop open / closed manually |

**Profile settings (from `s_profile`):**

| Option | What it does |
|---|---|
| Description | Short bio shown to customers |
| Logo | Send an image to use as your logo |
| Welcome Image | Hero image shown when a customer visits your `@handle` for the first time |
| Address | Type an address or send a location pin |
| Brand Name | Display name (can differ from trading name) |
| Currency | ISO code, e.g. `ZAR`, `USD` |
| Locale | e.g. `en-ZA`, `en-US` |
| Support Number | Customer-facing contact number (E.164 format, e.g. `+27741234567`) |
| Welcome Message | Custom greeting shown when a customer visits your shop |
| Owners | View, invite, or remove co-owners |

**Browse visibility (from Settings):**
- Toggle whether your store appears in the `browse_shops` list
- Hidden stores are still accessible via `@handle` directly

**Trading hours:**
- `h_default` — set standard hours (Mon-Fri 09:00-17:00, Sat 10:00-15:00)
- `h_mf` — set Mon-Fri hours (`HH:MM - HH:MM` or `closed`)
- `h_sat` — set Saturday hours
- `h_sun` — toggle Sunday open/closed

### Broadcast

| Message | What it does |
|---|---|
| `m_broadcast` | Start a broadcast to all opted-in customers |

1. Send `m_broadcast`
2. Type your message and send it
3. The bot sends it to all customers who haven't opted out
4. You receive a confirmation: `✅ Broadcast sent to X customers`

> Customers can opt out by replying `stop` to any message from your shop.

### Inviting Co-Admins

1. Go to **Settings → Edit Profile → Owners → Invite**
2. Enter the co-admin's WhatsApp number (E.164 format)
3. They receive a WhatsApp invite with Accept/Decline buttons
4. If they're a new contact and don't receive the message, share the `JOIN XXXXXX` code shown to you — they type it to the bot to accept

### Tutorial — Setting Up Your Store

1. Type `SwitchOmeru` → select your store
2. Send `menu` to open the dashboard
3. Go to **Settings → Edit Profile** and fill in your description, address, and welcome message
4. Upload a **Welcome Image** — this appears when customers first visit your `@handle`
5. Go to **My Menu → Add Item** and add your first product
6. Once a product is live, customers can find your shop via `@yourhandle`

---

## Profile 3 — Platform Admin

Only numbers listed in `PLATFORM_ADMIN_NUMBERS` have access. The master admin number is `27746854339`.

### Commands

| Message | What it does |
|---|---|
| `admin` / `pa_menu` | Opens the Platform Admin menu |
| `pa_invite` | Invite a new store owner |
| `pa_stores` | View all stores (active / onboarding / suspended) |
| `pa_invite_history` | See all invites with status (accepted / pending / revoked) |
| `pa_revoke` | Revoke a store owner's full access |
| `pa_revoke_admin` | Remove a specific admin from a store |
| `HelpOmeru` | Show all commands for all profiles |

### Tutorial — Inviting a New Store

1. Send `admin`
2. Tap **Invite Store**
3. Enter the store name. Optionally add a custom handle with `|`:
   - `BBQ Place` — handle auto-generated as `bbqplace`
   - `BBQ Place | bbqplace_ct` — custom handle
4. Enter the owner's WhatsApp number in E.164 format (e.g. `+27741234567`)
5. The owner receives a WhatsApp message with **Accept / Decline** buttons
6. If the owner is a new contact (never messaged the bot), share the `JOIN XXXXXX` code displayed — they type it to the bot to accept
7. Once accepted, the owner types `sell` or their `@handle_admin` to begin onboarding

### Tutorial — Merchant Onboarding (6 steps)

The invited merchant completes this after accepting the invite:

| Step | What to enter |
|---|---|
| 1 — Shop Name | Trading name (optionally `Name \| customhandle`) |
| 2 — Legal Name | Full legal name of owner or company |
| 3 — ID | 13-digit SA ID or CIPC registration number |
| 4 — Bank Details | Format: `Bank, Account Number, Type` (e.g. `FNB, 62845678901, Cheque`) |
| 5 — Hours | Choose Standard or enter custom hours |
| 6 — Terms | Accept platform fee and payout terms |

Once complete, the merchant is live and can receive orders immediately.

### Viewing & Managing Stores

1. Send `admin` → tap **View Stores**
2. All stores are listed with status (🟢 Active / 🟡 Onboarding / 🔴 Suspended)
3. Tap a store to see its details: handle, admins, browse visibility
4. Tap **Suspend / Unsuspend** to toggle store status

### Revoking Access

**Full access revoke:**
1. Send `admin` → tap **Revoke Access**
2. Enter the store admin handle (e.g. `@bbqplace_admin`)
3. Enter the owner's WhatsApp number
4. Access revoked immediately

**Remove specific admin:**
1. Send `admin` → tap **Revoke Admin**
2. Enter the store admin handle
3. The current admins are listed — enter the number to remove

### Invite History

Send `admin` → tap **Invite History** to see the last 10 invites across all stores, including their status (pending / accepted / revoked) and date.

---

## SwitchOmeru — Mode Switcher

Typing `SwitchOmeru` shows a list of all modes available to you:

| Who you are | Options shown |
|---|---|
| Regular customer | Customer (only option if no store) |
| Merchant (1 store) | Customer, your store |
| Merchant (multiple stores) | Customer, each of your stores |
| Platform Admin | Customer, Platform Admin, any stores you manage |

Selecting a store switches you directly into Merchant mode for that store.

---

## Global Commands (work in any mode)

| Message | What it does |
|---|---|
| `HelpOmeru` | Show all commands for your profile |
| `SwitchOmeru` | Show mode switcher |
| `switch` | Same as SwitchOmeru |
| `stop` / `unsubscribe` / `opt-out` | Opt out of marketing from last visited shop |
| `cancel` | Cancel the current multi-step flow |

---

## How Handles Work

- Every shop has a **public handle**: `@shopname` — customers use this to find the shop
- Every shop has an **admin handle**: `@shopname_admin` — merchants use this to access their dashboard directly
- Handles are unique and auto-generated from the trading name, or custom if specified during setup

---

## Invite Codes (JOIN XXXXXX)

When inviting someone who has never messaged the bot before, WhatsApp may not deliver the interactive invite message. In this case:

1. The admin receives a `JOIN XXXXXX` code after sending the invite
2. Forward that code to the invitee via regular WhatsApp message: _"Message the Omeru bot and type: JOIN XXXXXX"_
3. The invitee types `JOIN XXXXXX` to the bot to trigger the accept flow

---

## Notes

- Free-form messages can only be sent within 24 hours of a customer-initiated conversation (WhatsApp policy)
- Broadcasts require customers to have previously interacted with your shop
- Platform fee: **7%** of each completed order
- Stale order alerts fire every **10 minutes** for unprepared orders (max 2 alerts per order)
- The `browse_shops` list only shows stores that have **browse visibility enabled** (default: on)
