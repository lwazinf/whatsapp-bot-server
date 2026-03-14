# Onboarding & Help Context

## Merchant Onboarding

### Prerequisites
- Platform admin must issue an invite before a merchant can register.
- An invite creates a `MerchantInvite` record + a stub `Merchant` record (status: ONBOARDING).
- The invite is delivered as WhatsApp buttons **or** a `JOIN XXXXXX` short code if the invitee hasn't contacted the bot yet.

### Accepting an Invite
**Via WhatsApp buttons:**
- `accept_invite_{inviteId}` → session switches to `REGISTERING`, onboarding begins

**Via JOIN code:**
- Invitee types `JOIN XXXXXX` to the bot
- Bot looks up `MerchantInvite.short_code`, validates status = PENDING
- On match: same flow as button accept

### Resuming Mid-Onboarding
If a merchant leaves and returns (types "Hi", "hello", "sell", etc.) while their store is still in `ONBOARDING` and terms have **not** yet been accepted:
> _"👋 Resuming your onboarding for [Store Name]! Let's continue where you left off..."_

`getStep()` determines which step to resume based on which fields are populated on the Merchant record.

---

### Onboarding Steps (6/6)

**Step 1 — Shop Name** (`REGISTERING` mode, no merchant yet)
- Enter trading name
- Optional: append `| custom_admin_handle` to set a custom admin handle
- Bot generates: `handle` (slug, auto-deduplicated) + `admin_handle` (default: `{handle}_admin`)
- Merchant record created with `status: ONBOARDING`

**Step 2 — Legal Name**
- Enter full legal entity name (for compliance/payouts)

**Step 3 — ID / Registration Number**
- Enter ID number or company registration number

**Step 4 — Bank Details**
- Enter bank account number, bank name, account type
- Used for payout processing

**Step 5 — Operating Hours**
- Choose: Standard Hours (Mon–Fri 9–5, Sat 10–3, Sun closed) OR Custom Hours
- Custom: enter Mon–Fri open/close → Saturday open/close → Sunday open toggle
- Confirmation message shown on standard hours selection

**Step 6 — Terms**
- Platform fee %, payout day, obligations shown
- Buttons: ✅ I Accept | ❌ Cancel
- On accept:
  - `accepted_terms: true` saved
  - Invite marked `ACCEPTED`
  - Session switches to `mode: MERCHANT` + `active_merchant_id`
  - **Status remains ONBOARDING** — store is not live yet
  - Message shown: "✅ Terms accepted! Add your first product to go live."

---

### Going-Live Disclaimer (Final Step)

After the merchant publishes their **first product** (taps "🚀 Make Live" on the product preview), a disclaimer is shown before the store becomes visible:

```
🚀 Ready to go live?

By making your store live on Omeru, you confirm that:
• Your products are accurately described and priced
• You will fulfil orders placed through the platform
• You agree to Omeru's terms of service. [Fee info if available]

Your store will be visible to customers once you accept.

[✅ Accept & Go Live]  [📦 Back to Products]
```

On accepting (`ob_golive_accept_{pid}`):
- `Merchant.status` → `ACTIVE`
- Store becomes visible in Browse immediately
- Celebration message sent: "🎉 [Store Name] is now LIVE! Customers can find you at @handle."
- Merchant lands on dashboard + product list

**Platform admin can also forcibly activate** a store from the admin panel (`pa_activate_{id}`) at any time, bypassing this flow.

---

### Onboarding State Keys
| State Key | Step |
|-----------|------|
| (none — step determined by Merchant fields) | Steps 1–6 |
| `OB_HRS_MF` | Custom hours: Mon–Fri entry |
| `OB_HRS_SAT` | Custom hours: Saturday entry |
| Mode `MERCHANT` + status `ONBOARDING` + accepted_terms | First product + disclaimer |

---

## Customer Onboarding

Customers have no formal registration. Their profile is created on first contact.

**First message (any greeting — "Hi", "Hello", "Hey", "Start"):**
- `UserSession.has_seen_onboarding` checked
- If `false`: send platform onboarding image + intro message + tip + 2 buttons
  ```
  [🛍️ Browse Stores]  [👤 My Account]
  💡 Tip: Type @storename to visit any shop directly
  ```
- `has_seen_onboarding` set to `true` — never shown again
- On all subsequent greetings: standard customer home screen (no image, no tip)

---

## Help & Documentation

### HelpOmeru Command
- Restricted to **Platform Admins only**.
- Typing `HelpOmeru` or `helpomeru` from an admin number opens the admin help/command reference.
- If typed by a merchant → redirected silently to their dashboard.
- If typed by a customer → redirected silently to the customer home.
- Reason: help output contains backend implementation details not intended for lower-level profiles.

### Omeru Command (Merchant & Admin only)
- Typing `Omeru` (any case) drops all active flow state (`active_prod_id`, `state`) and returns the user to their profile's main menu:
  - Merchant → Dashboard
  - Admin → Admin menu
- Customers do not have this command.
- Use case: cancel any in-progress flow (product creation, feedback, broadcast, etc.) without needing a Cancel button.

### "cancel" / ob_cancel
- Available during onboarding to pause registration.
- Returns: "Registration paused. Type *sell* to continue later."
- Session mode reverts to CUSTOMER.

### Finding a Store
- Type `@shopname` anywhere (in any profile mode, if a customer) to open a store directly.
- Example: `@bbqplace` → opens BBQ Place product page
- Works regardless of current screen or context.

### Store Handle vs Admin Handle
| Handle | Format | Who uses it |
|--------|--------|-------------|
| `@handle` | `@storename` | Customers browsing |
| `@admin_handle` | `@storename_admin` | Merchants/admins accessing management |

---

## Post-Onboarding: What Merchants Should Know

1. **Browse visibility**: New stores appear in Browse by default. Toggle off in Settings → `show_in_browse`.
2. **Operating hours**: Stores outside hours show "closed" to customers. Manual close is also available.
3. **Adding products**: Products start as DRAFT. Publishing = status ACTIVE + in stock.
4. **Variants**: Add variants (size/colour/SKU/price) per product. Out-of-stock variants show a badge.
5. **Kitchen**: Incoming paid orders appear in the Kitchen tab. Mark ready when prepared, collected when handed over.
6. **Broadcast**: Send a message to all opted-in customers. Customers opt in by interacting with the store.
7. **Feedback**: Use the dashboard feedback button to send a message to the platform admin.
