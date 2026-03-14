# Stats Context — Platform Admin Eagle-Eye Analytics

## Overview

The platform admin needs a top-down view of the entire Omeru ecosystem — not just their own store, but every store, category, and customer on the platform. Stats are surfaced through `pa_stats` and sub-views, all driven by live queries against the existing database.

No new tables are required for Phase 1. All stats derive from: `Order`, `Merchant`, `Product`, `MerchantCustomer`, `AuditLog`, and `UserSession`.

---

## Stats Entry Point

Admin menu gets a new button:
```
[📊 Platform Stats]  →  pa_stats
```

Opening `pa_stats` shows a summary card + sub-view buttons.

---

## Platform Summary Card (`pa_stats`)

```
📊 Platform Stats — Omeru

🏪 Stores:       Active: N  |  Onboarding: N
📦 Orders:       Today: N   |  This Month: N
💰 Revenue:      Today: R X  |  This Month: R X  (gross, before fees)
👥 Customers:    Total: N
🛍️ Products:     Active: N

[📈 Store Rankings]   [🕐 Peak Hours]
[📍 Locations]        [📂 Categories]
```

---

## Sub-Views

### 1. Store Rankings (`pa_stats_stores_{page}`)

Ranked by total paid revenue (all time).

For each store (up to 5 per page):
```
🥇 @handle — Store Name
   💰 Revenue: R X  |  ✅ Orders: N  |  👀 Customers: N
   📦 Products: N active
```

Also flags:
- 🏆 Most successful orders (highest completed order count)
- 👀 Most traffic (most unique `MerchantCustomer` records)
- 📉 Worst performing (fewest completed orders in last 30 days)
- 🔥 Most active (most orders in last 7 days)

Button: `pa_stats_store_{merchantId}` → drill-down for a single store.

### 2. Single Store Drill-Down (`pa_stats_store_{merchantId}`)

```
📊 @handle — Store Name

💰 All-time revenue: R X
📦 Total orders: N  |  Completed: N  |  Cancelled: N
👥 Unique customers: N
⭐ Top product: [Name] — N orders
📅 Best day (last 30): [Day of week]
⏰ Peak hour (last 30): [HH:00 – HH:00]
```

### 3. Category Performance (`pa_stats_cats`)

Aggregated across all stores per `Merchant.store_category`:

```
📂 Category Breakdown

🍔 Food & Drink     — Stores: N  |  Orders: N  |  Revenue: R X
👗 Fashion          — Stores: N  |  Orders: N  |  Revenue: R X
💄 Beauty           — ...
...
```

Sorted by revenue descending.

### 4. Peak Hours (`pa_stats_hours`)

Based on `Order.createdAt` timestamps, grouped by hour of day (0–23):

```
⏰ Peak Activity Hours (last 30 days)

🔥 Busiest:   14:00–15:00 — N orders
📈 Active:    12:00–13:00 — N orders
             13:00–14:00 — N orders
🌙 Quietest:  03:00–04:00 — N orders

Top 3 days of week: [Wednesday, Friday, Saturday]
```

Uses `EXTRACT(HOUR FROM "createdAt")` raw query against `Order`.

### 5. High-Revenue Hours (`pa_stats_rev_hours`)

Similar to peak hours but aggregated on `Order.total`:

```
💰 High-Revenue Hours (last 30 days)

🔝 19:00–20:00 — R X total
   18:00–19:00 — R X total
   13:00–14:00 — R X total
```

Useful for merchants to know when to have stock ready.

### 6. Location Activity (`pa_stats_locations`)

Based on `UserSession.delivery_address` and `Merchant.address` fields:

```
📍 Activity by Region (last 30 days, top 10)

1. Johannesburg — N orders
2. Cape Town    — N orders
3. Durban       — N orders
...
```

Implementation: parse city/region from address string (simple keyword extraction or first comma-separated segment). Not geocoded — text-based grouping.

---

## Data Sources Mapping

| Stat | Source |
|------|--------|
| Revenue | `Order` where `status IN ('PAID','READY_FOR_PICKUP','COMPLETED')`, sum of `total` |
| Order count | `Order` count by status, date, merchant |
| Unique customers | `MerchantCustomer` count per merchant / distinct `customer_id` on orders |
| Most traffic | `MerchantCustomer` count (has_seen_welcome or any interaction) |
| Worst performing | Orders completed in last 30 days (ascending) |
| Peak hours | `EXTRACT(HOUR FROM createdAt)` on `Order`, grouped + counted |
| Category stats | Join `Merchant.store_category` + `Order` |
| Location | Parse `UserSession.delivery_address` or `Merchant.address` by region keyword |
| Product rank | `OrderItem` group by `product_id`, count |

---

## Access Control

- Stats are **Platform Admin only** (all `pa_stats*` prefixes checked via `isPlatformAdmin(from)` + `pa_` routing).
- Merchants have their own scoped stats via `m_stats` — their store only.
- No customer-facing stats.

---

## Implementation Notes

- All queries use existing Prisma models — no schema changes needed.
- Raw SQL with `db.$queryRaw` needed for hour extraction and window functions.
- Stats are computed live (no caching for now) — acceptable latency for a single admin user.
- Pagination: 5 stores per page for rankings; single-page summaries for all other views.
- Date range defaults: "last 30 days" for hourly/daily breakdowns; "all time" for rankings and totals.
- WhatsApp button limit (3) means each stats sub-view fits in one or two messages.

---

## Customer Feedback Stats (included in store drill-down)

When viewing a single store's stats (`pa_stats_store_{merchantId}`), also show:
```
⭐ Avg rating:    4.2 / 5  (N reviews)
💬 Total reviews: N
📉 Low ratings:   N  (≤ 2 stars)
```

Source: `AuditLog` where `action = 'CUSTOMER_FEEDBACK'` and `metadata_json->>'merchant_id' = merchantId`, aggregating `rating` from `metadata_json`.

---

## Future Enhancements (not yet implemented)
- Retention rate (customers who ordered more than once)
- Average order value per store
- Revenue per category per month (trend)
- Geocoded location clustering (requires external geocoding API)
- Export to CSV / email report
