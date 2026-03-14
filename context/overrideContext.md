# Override Context — Admin Commands, Privileges & Platform Controls

## Overview

Overrides are privileged actions that bypass normal user-facing flows. They are split into:

1. **Keyword overrides** — typed commands (`Omeru`, `HelpOmeru`) that reset or surface admin tools
2. **Platform admin actions** — full control panel for store and invite management
3. **Privilege isolation rules** — what each profile can and cannot do

---

## Keyword Overrides

### `Omeru` (Merchant & Admin only)
- **Who can use it:** Merchants + Platform Admins
- **Effect:** Drops all active state (`active_prod_id`, `state`) and instantly returns the user to their profile's home menu
  - Merchant → Merchant Dashboard
  - Platform Admin → Admin Menu
- **Customers:** This command does nothing / is ignored
- **Use case:** Cancel any in-progress flow without needing a specific cancel button (works mid-product-creation, mid-feedback, mid-broadcast, etc.)

### `HelpOmeru` (Platform Admin only)
- **Who can use it:** Platform Admins only
- **Effect:** Opens the admin command reference / debug info
- **Merchants:** Silently redirected to their dashboard
- **Customers:** Silently redirected to customer home
- **Reason:** The help output contains backend implementation details that must not leak to lower-level profiles

### `@admin_handle` (Merchants only)
- Typing `@shopname_admin` directly switches the merchant's session to MERCHANT mode for that store
- Validates `isAuthorizedOwner(from, merchant.id)` before proceeding
- If status is ONBOARDING, routes to onboarding flow instead

### `JOIN XXXXXX` (Anyone)
- Parsed by handler on any message matching `/^JOIN\s+([A-Z0-9]{6})$/i`
- Looks up `MerchantInvite.short_code` (case-insensitive)
- Valid if invite is PENDING
- On match: begins merchant onboarding for that number

---

## Platform Admin — Full Control Panel

Access: Any number in `PLATFORM_ADMIN_NUMBERS` / `ADMIN_WHATSAPP_NUMBER` env vars.

### Opening the Panel
- Switch with `sw_admin` → immediately shows admin menu (no extra step)
- `admin` or `pa_menu` at any time also opens it

### Admin Menu
```
🛡️ Platform Admin
Active stores: N | Onboarding: N | Pending invites: N

[➕ Invite Store]  [🏪 Stores]  [📋 Invite History]
[💬 Feedback Inbox]  [🗑️ Revoke Access]
```

### Invite Store (`pa_invite`)
**Override capability:** Admin can create a merchant account for any phone number.
1. Enter: store name (optionally `| custom_handle`)
2. Enter: owner phone in E.164 format (`+27741234567`)
3. Bot upserts Merchant + MerchantInvite, sends WhatsApp invite or provides JOIN code fallback

Helper format: `"BBQ Place"` → handle: `bbqplace`, admin_handle: `bbqplace_admin`
Custom: `"BBQ Place | bbq_ct"` → handle: `bbq_ct`, admin_handle: `bbq_ct_admin`

### Activate Store (`pa_activate_{merchantId}`)
**Override capability:** Admin can force a store from ONBOARDING → ACTIVE without the merchant completing the first-product disclaimer flow.
- Sets `status: ACTIVE`
- Notifies merchant: "Your store is now LIVE on Omeru"
- Use when: merchant needs assistance, or completing onboarding via admin support

### Suspend / Unsuspend (`pa_suspend_{merchantId}`)
**Override capability:** Admin can take a store offline instantly.
- ACTIVE → SUSPENDED: store invisible to customers, merchant + owners notified
- SUSPENDED → ACTIVE: store reinstated, no announcement

### Revoke Admin Access (`pa_revoke_do_{merchantId}_{waId}`)
**Override capability:** Admin can remove any owner or admin from a store.
1. `pa_store_admins_{merchantId}` → list of active owners
2. Tap an owner → confirmation dialog
3. Confirm → `MerchantOwner.is_active = false`, PENDING invites for that `wa_id` revoked
4. AuditLog entry created

### Revoke via Text (`pa_revoke`)
Legacy flow for when the admin knows the admin handle directly:
1. Type `@shopname_admin`
2. Type the wa_id to remove

### Feedback Inbox (`pa_feedback`)
**Override capability:** Admin sees all feedback from all merchants and customers.
- Landing screen: `🏪 Merchants (N)` + `👤 Customers (N)` buttons with live counts
- Merchant inbox: `pa_fbm_{page}` — reads `AuditLog` where `action = 'MERCHANT_FEEDBACK'`
- Customer inbox: `pa_fbc_{page}` — reads `AuditLog` where `action = 'CUSTOMER_FEEDBACK'`
- Each paginated (5/page), shows: sender name, date, message

### Resend Invite (`pa_resend_{inviteId}`)
- Resends WhatsApp invite buttons to the invitee
- Provides JOIN code reminder in the message

---

## Privilege Isolation Rules

### What Customers Cannot Access
- Any `pa_*` admin action
- Any `m_*` merchant action (inventory, kitchen, settings, broadcast, dashboard)
- HelpOmeru (silently redirected)
- Omeru keyword (ignored)
- `@admin_handle` access (they would see "Admin handle not found" or "Not authorised")

### What Merchants Cannot Access
- Any `pa_*` admin action
- Other merchants' stores (can only manage stores they are authorised on)
- HelpOmeru (silently redirected to their dashboard)
- Customer-mode actions while in MERCHANT mode (cart, wishlist, browse store pages)

### What Platform Admins Can Do That Merchants Cannot
- Invite, activate, suspend, unsuspend any store
- Revoke any owner's access from any store
- See all feedback from all merchants and customers
- Access HelpOmeru
- Override store status directly

### What Platform Admins Cannot Do
- They cannot act as a merchant (no inventory, kitchen, etc.) unless they also hold a MerchantOwner record
- They cannot see individual customer orders (no order-level access in admin panel — planned for stats context)

---

## State Override: Clearing Stuck Flows

If a user is stuck in a flow (e.g. waiting for text input, mid-product-creation):
- **Merchant / Admin:** Type `Omeru` → all state cleared, back to home
- **Customer:** Tapping home/browse buttons (e.g. `c_home`, `browse_shops`) clears `ADDR_FLOW` state and falls through to normal routing
- **Platform Admin direct:** Any `pa_*` input clears the state via `clearState(from)` at the start of most handler branches

---

## Audit Trail

All privileged actions are logged to `AuditLog`:
- `actor_wa_id` — who performed the action
- `action` — e.g. `PRODUCT_CREATED`, `MERCHANT_FEEDBACK`, `CUSTOMER_FEEDBACK`
- `entity_type` + `entity_id` — what was acted on
- `metadata_json` — rich context (product name, price, merchant name, message text, etc.)

This provides a complete activity log accessible for debugging and compliance.
