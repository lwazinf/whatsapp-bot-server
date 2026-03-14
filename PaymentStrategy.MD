# OMERU.io — Payment Gateway & Scaling Strategy

> A complete strategic reference for OMERU's payment infrastructure, commission model, WhatsApp API limits, and SaaS pricing architecture.

---

## Table of Contents

1. [Payment Gateway Comparison](#1-payment-gateway-comparison)
2. [The Seller Trust Problem](#2-the-seller-trust-problem)
3. [Commission Model & Real Cost Stack](#3-commission-model--real-cost-stack)
4. [Safe Pricing Model](#4-safe-pricing-model)
5. [360dialog & WhatsApp Rate Limits](#5-360dialog--whatsapp-rate-limits)
6. [Infrastructure: Koyeb Risk Assessment](#6-infrastructure-koyeb-risk-assessment)
7. [SaaS Subscription Model](#7-saas-subscription-model)
8. [Unit Economics & Break-Even Analysis](#8-unit-economics--break-even-analysis)
9. [Scaling Roadmap](#9-scaling-roadmap)
10. [Priority Action List](#10-priority-action-list)

---

## 1. Payment Gateway Comparison

| Gateway | Transaction Fee | Marketplace Splits | EFT | Cards | SA Native | Settlement |
|---|---|---|---|---|---|---|
| **PayFast** | 2.9% + R1.50 (card) / 2% + R2.00 (EFT) | ✅ Built-in, instant | ✅ | ✅ | ✅ | 1–2 business days |
| **Ozow** | 1.5%–2.5% (volume-tiered) | ❌ No native split API | ✅ Only | ❌ | ✅ | Next business day |
| **Peach Payments** | 2.85% + R0.99 (card) / 1.5% + R1.50 (EFT) | ~ Via payout API | ✅ | ✅ | ✅ | ~90 sec (RTC) |
| **PayGate** | ~2.5% (negotiable at volume) | ❌ Manual disbursements | ✅ | ✅ | ✅ | 2–3 business days |
| **Stripe Connect** | 2.9% + $0.30 USD + 1.5% cross-border | ✅ Best-in-class | ❌ | ✅ | ❌ Not direct | 2–7 days (ZAR route) |

### Recommendation: PayFast

**PayFast is the clear winner for OMERU.** It is the only South African gateway with a native Split Payments feature built specifically for marketplaces — it instantly allocates commission and listing fees when a payment is made, with splits configurable as a percentage, a fixed amount, or both.

**Why not Stripe?** Stripe Connect is not natively available in South Africa. Routing through a workaround (e.g. Paystack) adds currency conversion friction and an additional 1.5% cross-border charge on top of the base rate. Not suitable for a ZAR-only local marketplace.

**Why not Ozow alone?** Ozow supports EFT only — a significant chunk of customers wanting to pay by card would be locked out. Viable as a secondary EFT option once OMERU is live.

**Peach Payments** is the upgrade path at enterprise scale due to its Real-Time Clearance payouts (~90 seconds to seller) and strong fraud tooling.

---

## 2. The Seller Trust Problem

The core fear sellers have: *"This platform will collect my money and I'll have to chase them for it."*

Your actual model: *"OMERU routes the order. PayFast handles the money. You get paid directly."*

### How PayFast Split Payments Works

1. Customer pays via PayFast on the OMERU WhatsApp bot
2. PayFast splits the payment automatically at transaction time:
   - **Seller receives** their portion directly into their PayFast account
   - **OMERU receives** the platform commission (deducted at source)
3. No money "sits" with OMERU — PayFast is the licensed payment processor

### Seller-Facing Proposal One-Liner

> *"OMERU connects your store to customers via WhatsApp. When a customer pays, PayFast — South Africa's trusted payment processor — splits the payment instantly: your earnings settle to your account, and OMERU's platform fee is deducted at source. You're always in control of your money."*

### Seller Onboarding Flow

1. Seller registers on OMERU and provides bank details + ID
2. OMERU registers them as a PayFast sub-merchant
3. PayFast verifies them (KYC) and approves their settlement account
4. All future payments for that seller settle directly to their verified account

The KYC step is a **trust signal** — it shows sellers the system is formal and regulated, not informal.

---

## 3. Commission Model & Real Cost Stack

### What Actually Happens on a R200 Order

| Line Item | Amount |
|---|---|
| Customer pays | R200.00 |
| PayFast gateway fee (2.9% + R1.50) | – R7.30 |
| OMERU platform commission (e.g. 3.5%) | + R7.00 → OMERU |
| Seller receives via PayFast split | R192.70 |
| OMERU net after gateway cost | **R7.00 – R7.30 = –R0.30** ⚠️ |

### The Break-Even Problem with 2.5% Commission

PayFast's flat R1.50 fee dominates on small orders. At a 2.5% commission rate:

- **Break-even order value = R292**
- Any order below R292 at 2.5% commission generates a net loss after gateway fees
- The true minimum viable commission rate is **~3.75%** before WhatsApp or server costs

### Commission Rate by Order Size

| Order Range | Recommended Commission | Reason |
|---|---|---|
| R0 – R100 | Set minimum order | Gateway eats everything |
| R100 – R300 | 5% | Tight margin; EFT preferred |
| R300 – R1 000 | 3.5%–4% | Sweet spot — flat fee shrinks as % |
| R1 000+ | 2.5%–3% | High value; flat fee negligible |

> **Set a minimum order value of R100 in the OMERU bot flow.** This is the single fastest margin protection you can implement with zero added complexity.

---

## 4. Safe Pricing Model

### Why 2.5% Flat Is Too Low

On a R200 order with 2.5% commission:
- Your cut: R5.00
- PayFast fee: R7.30
- **Net: –R2.30 (loss)**

On a R500 order with 3.5% commission:
- Your cut: R17.50
- PayFast fee: R15.95 (2.9% + R1.50)
- **Net: +R1.55 profit** — before subscription revenue

The subscription fee is what makes the model work. Commission is the upside on volume, not the foundation.

### Combined Model: Subscription + Commission

This is how every successful marketplace (Takealot, Uber Eats, Shopify) is structured:

- **Subscription** covers your fixed costs and guarantees baseline revenue regardless of GMV
- **Commission** scales with seller success — aligned incentives
- **Minimum order** protects you from gateway fee erosion on micro-transactions

---

## 5. 360dialog & WhatsApp Rate Limits

### The One-Number Advantage

You pay **R1 000/month** to 360dialog for **one WhatsApp number**. Every store that joins OMERU gets listed under that same number. Customers chat with "OMERU" and the bot routes them to the right store internally via store IDs.

**You are not paying R1 000 per store.** You are paying R1 000 for the entire platform. This is OMERU's core leverage: fixed cost is flat while revenue grows linearly with each store added.

### Meta Messaging Limits (via 360dialog)

| Tier | Unique Users / 24 hrs | How to Unlock |
|---|---|---|
| New portfolio | 250 | Default on signup |
| Tier 1 | 1 000 | Auto after hitting 50%+ usage with high quality score |
| Tier 2 | 10 000 | Auto after Tier 1 threshold |
| Unlimited | Unlimited | Business Verification + sustained quality |

**At 30 stores each getting 10 orders/day = 300 unique conversations/day** — this triggers auto-upgrade from 250 to 1 000 limit. You cross this threshold before you hit 30 stores.

> Apply for Meta Business Verification via 360dialog's partner-led flow as soon as you have real order volume. This unlocks limit upgrades significantly faster than the automatic path.

### Post-July 2025 Pricing (Per-Message, Not Per-Session)

Since July 1, 2025, 360dialog bills **per template message**, not per 24-hour conversation session.

| Message Type | Cost |
|---|---|
| Utility templates within open customer service window | **Free** |
| Utility templates outside the 24hr window | Charged (Meta rate card) |
| Marketing templates | Charged |
| Service messages (user-initiated, free-form replies) | **Free** |

**Practical impact for OMERU:** Order confirmations, status updates, and receipts sent while the customer's conversation window is open cost nothing. This covers the vast majority of your bot's outbound messages in a normal ordering flow.

### When to Add a Second Number

Add a second 360dialog number (R1 000/mo additional) when you reach **100+ active stores** and want to route by category:
- Number A: Restaurants & food
- Number B: Grocery, fuel, flowers

One number is sufficient until that scale. The routing is handled in code, not by separate numbers.

---

## 6. Infrastructure: Koyeb Risk Assessment

### Free Tier — Current Setup

| Spec | Value |
|---|---|
| RAM | 512 MB |
| vCPU | 0.1 |
| Cold start (Deep Sleep) | **1–5 seconds** |
| Scale-to-zero | After 1 hour idle |
| Worker services | ❌ Not available |
| Custom scaling | ❌ Not available |
| Region | Frankfurt or Washington only |

### The Critical Production Risk

PayFast fires its payment confirmation webhook immediately after a transaction. If your Koyeb free instance is in Deep Sleep (1–5 sec cold start), the webhook fires into a sleeping server. Your bot doesn't process the order — the customer gets no confirmation, the seller doesn't know about it, and OMERU appears broken.

**This is a critical failure mode for a live payment platform.**

### Koyeb Plan Comparison

| Plan | Cost | Cold Start | Custom Scaling | Recommendation |
|---|---|---|---|---|
| Free (Starter) | R0/mo | 1–5 seconds | ❌ | Dev/testing only |
| Pro | R540/mo (~$29) | **~200ms (Light Sleep)** | ✅ | Production minimum |
| Scale | R5 500/mo (~$299) | ~200ms | ✅ Advanced | 50+ stores |

> **Upgrade to Koyeb Pro before onboarding your first paying seller.** This is non-negotiable. The R540/mo cost is recovered by your 3rd store subscription.

### Webhook Queue — The Safety Net

Even on Pro, implement a message queue between 360dialog webhooks and your processing logic:

```
360dialog webhook → BullMQ queue (Redis) → Worker processes order
```

This ensures:
- No dropped webhooks during traffic spikes
- Retries on processing failures
- Decoupled bot response from payment processing
- Auditable order event log

Recommended stack: **BullMQ + Redis** (Upstash free tier for Redis works at early scale).

---

## 7. SaaS Subscription Model

### Tier Structure

| | **Starter** | **Growth** | **Pro** |
|---|---|---|---|
| Price | R200/mo | R450/mo | R900/mo |
| Products | Up to 50 | Unlimited | Unlimited |
| Locations | 1 | 1 (priority listed) | Up to 3 |
| Commission rate | 3.5%–5% | 3% | 2.5% |
| Broadcasts | ❌ | ✅ Promo messages | ✅ |
| Analytics | Monthly report | Weekly | Real-time dashboard |
| Support | Community | Email | Dedicated |
| Bot placement | Standard | Priority | Featured |

### Why the Tiered Commission Discount Works

Growth sellers at R450/mo get a 0.5%–1% lower commission rate. On a seller doing R15 000/month in GMV:
- At 3.5% commission: they pay R525/mo in commission
- At 3% commission: they pay R450/mo in commission
- The commission saving (R75) almost offsets the subscription upgrade cost (R250 extra)

This creates a rational upgrade path: sellers who are doing real volume will upgrade because the commission saving partially subsidises it.

---

## 8. Unit Economics & Break-Even Analysis

### Fixed Monthly Platform Costs

| Line Item | Monthly Cost |
|---|---|
| 360dialog (1 WABA number) | R1 000 |
| Koyeb Pro | R540 |
| Supabase (DB, free tier) | R0 |
| Cloudflare R2 (storage, free tier) | R0 |
| Meta utility messages (in-window, free) | R0 |
| **Total fixed floor** | **R1 540 / mo** |

### Break-Even: 8 Stores at R200/mo

```
8 stores × R200 = R1 600 > R1 540 fixed costs
```

Every store from #9 onward is pure subscription profit before commissions.

### Revenue Projection Table

| Stores | Sub Revenue | Est. Commission* | Fixed Costs | Net Profit |
|---|---|---|---|---|
| 5 | R1 000 | R750 | R1 540 | **–R290** |
| 8 | R1 600 | R1 200 | R1 540 | **+R1 260** |
| **15** | **R3 000** | **R2 250** | **R1 540** | **+R3 710** |
| 30 | R6 000 | R4 500 | R1 540 | **+R8 960** |
| 50 | R10 000 | R7 500 | R2 500** | **+R15 000** |

> *Commission estimated at 3.5% on avg R500 order, 3 orders/store/month (conservative).  
> **Infra upgrade at 50+ stores (Koyeb Scale or Railway Pro).

### At 15 Stores — The Comfort Zone

- Subscription alone: R3 000/mo
- Commission upside (conservative): R2 250/mo
- Total revenue: **R5 250/mo**
- Fixed costs: R1 540/mo
- **Net: R3 710/mo before your time cost**

With a mix of Starter + Growth tier sellers, this number is higher.

---

## 9. Scaling Roadmap

### Trigger-Based Upgrade Points

| Milestone | Action | Est. Cost |
|---|---|---|
| **Now (0 sellers)** | Koyeb free + 360dialog. Build and test. | R0/mo |
| **3–5 sellers** | Upgrade Koyeb → Pro. Add BullMQ/Redis webhook queue. | ~R540/mo |
| **8 sellers** | Break-even on fixed costs. Start reinvesting in product. | — |
| **250+ msg/day** | Apply for Meta Business Verification → auto-upgrade to 1K limit. | Time-critical |
| **10+ sellers** | Move DB to managed Postgres (Supabase Pro). Add Cloudflare WAF. | ~R1 200/mo |
| **50+ sellers** | Koyeb Scale ($299) or Railway Pro. Horizontal autoscaling. | ~R5 500/mo |
| **100+ sellers** | Add second 360dialog WABA number. Route by category. | +R1 000/mo |

### Infrastructure Philosophy

Keep your cost base as variable as possible for as long as possible. The sequence is:

```
Free tier (dev) → Koyeb Pro (production) → Add Redis → Managed DB → Scale plan
```

Do not upgrade infrastructure ahead of seller count. Let seller revenue fund each infrastructure upgrade.

---

## 10. Priority Action List

Ordered by urgency:

1. **Set minimum order value of R100** in the OMERU bot flow immediately. Zero code complexity. Protects margin from gateway fee erosion on micro-transactions.

2. **Upgrade Koyeb to Pro ($29/mo ≈ R540)** before onboarding the first paying seller. Eliminates the 1–5 second cold start that kills payment webhooks.

3. **Add BullMQ + Redis webhook queue** between 360dialog and your processing logic. Prevents dropped webhooks during traffic spikes and gives you a retryable, auditable order event log.

4. **Launch with tiered subscriptions (R200 / R450 / R900)** from day one — not flat R200. Signals a serious platform and lets volume sellers self-select into Growth, immediately improving per-store economics.

5. **Apply for Meta Business Verification** via 360dialog's partner-led flow as soon as you have real order volume (30+ active daily conversations). Unlocks the 1 000 then 10 000 unique user/day limits significantly faster.

6. **Contact PayFast** to confirm sub-merchant KYC requirements and Split Payments API integration details before your first seller goes live.

7. **Add Ozow as a secondary EFT option** once stable — it captures bank-direct customers who don't want to use cards and has lower transaction fees on EFT payments.

---

## Appendix: Key Numbers Reference

| Item | Value |
|---|---|
| PayFast card fee | 2.9% + R1.50 |
| PayFast EFT fee | 2% + R2.00 minimum |
| PayFast payout fee | R8.70/withdrawal |
| 360dialog WABA (1 number) | ~R1 000/mo |
| Koyeb Pro | ~R540/mo ($29) |
| Commission break-even order (2.5%) | R292 |
| Commission break-even order (3.5%) | R209 |
| Platform fixed cost floor | R1 540/mo |
| Stores to break even (R200 sub) | 8 stores |
| Stores to reach R3 700+ net profit | 15 stores |
| Meta messaging limit (new portfolio) | 250 unique users/day |
| Meta messaging limit (after verification) | 1 000 → 10 000 → unlimited |

---

*Document prepared for OMERU.io — REMOLUHLE (PTY) Ltd. Based on pricing data current as of March 2026. Verify current rates with PayFast, 360dialog, and Koyeb before finalising commercial decisions.*
