# 💰 Financial Model - Platform Revenue & Costs

## Business Model Overview

**Revenue Model:** 5% commission on every completed order  
**Payout Schedule:** Every Friday  
**Merchant Onboarding:** Free  
**Customer Usage:** Free  

---

## Revenue Projections

### Scenario 1: Conservative Growth (Year 1)

| Month | Businesses | Avg Orders/Business/Day | Total Orders/Month | Avg Order Value | GMV | Platform Revenue (5%) |
|-------|-----------|------------------------|-------------------|----------------|-----|----------------------|
| 1 | 10 | 5 | 1,500 | R300 | R450,000 | **R22,500** |
| 2 | 15 | 6 | 2,700 | R320 | R864,000 | **R43,200** |
| 3 | 25 | 8 | 6,000 | R330 | R1,980,000 | **R99,000** |
| 6 | 50 | 12 | 18,000 | R350 | R6,300,000 | **R315,000** |
| 12 | 100 | 15 | 45,000 | R400 | R18,000,000 | **R900,000** |

**Year 1 Total Revenue:** ~R3.5M

---

### Scenario 2: Moderate Growth (Year 1)

| Month | Businesses | Orders/Business/Day | Total Orders/Month | Avg Order Value | GMV | Platform Revenue |
|-------|-----------|-------------------|-------------------|----------------|-----|-----------------|
| 1 | 20 | 8 | 4,800 | R300 | R1,440,000 | **R72,000** |
| 3 | 50 | 12 | 18,000 | R330 | R5,940,000 | **R297,000** |
| 6 | 100 | 18 | 54,000 | R350 | R18,900,000 | **R945,000** |
| 12 | 200 | 25 | 150,000 | R400 | R60,000,000 | **R3,000,000** |

**Year 1 Total Revenue:** ~R10M

---

### Scenario 3: Aggressive Growth (Year 1)

| Month | Businesses | Orders/Business/Day | Total Orders/Month | Avg Order Value | GMV | Platform Revenue |
|-------|-----------|-------------------|-------------------|----------------|-----|-----------------|
| 1 | 50 | 10 | 15,000 | R300 | R4,500,000 | **R225,000** |
| 3 | 150 | 15 | 67,500 | R330 | R22,275,000 | **R1,113,750** |
| 6 | 300 | 20 | 180,000 | R350 | R63,000,000 | **R3,150,000** |
| 12 | 500 | 30 | 450,000 | R400 | R180,000,000 | **R9,000,000** |

**Year 1 Total Revenue:** ~R30M

---

## Cost Structure

### Technology Costs (Monthly)

| Component | Conservative | Moderate | Aggressive |
|-----------|-------------|----------|-----------|
| **WhatsApp API** | R5,000 | R20,000 | R60,000 |
| (Based on message volume) |
| **Server Hosting** | R1,500 | R5,000 | R15,000 |
| (Railway/AWS auto-scale) |
| **Database** | R800 | R2,000 | R5,000 |
| (PostgreSQL) |
| **Redis Cache** | R500 | R1,000 | R3,000 |
| **CDN/Storage** | R300 | R1,000 | R3,000 |
| **Monitoring Tools** | R200 | R500 | R1,000 |
| **API Services** | R500 | R1,500 | R4,000 |
| **TOTAL TECH** | **R8,800** | **R31,000** | **R91,000** |

### Payment Processing Costs

**Payment Gateway Fees:**
- Ozow: 1.5-2% per transaction
- Yoco: 2.95% per transaction

**Assumption:** 70% Ozow, 30% Yoco  
**Blended Rate:** 2.03%

| Scenario | Monthly GMV | Payment Fees (2.03%) |
|----------|------------|---------------------|
| Conservative (Month 6) | R6,300,000 | R127,890 |
| Moderate (Month 6) | R18,900,000 | R383,670 |
| Aggressive (Month 6) | R63,000,000 | R1,278,900 |

### Banking & Transfer Costs

**EFT Costs for Friday Payouts:**
- R5 per EFT transfer
- Assumption: 80% of businesses get paid weekly

| Scenario | Businesses | Weekly Transfers | Monthly Cost |
|----------|-----------|-----------------|-------------|
| Conservative | 100 | 80 × 4 | R1,600 |
| Moderate | 200 | 160 × 4 | R3,200 |
| Aggressive | 500 | 400 × 4 | R8,000 |

### Operational Costs (Monthly)

| Cost Category | Conservative | Moderate | Aggressive |
|--------------|-------------|----------|-----------|
| **Customer Support** | R15,000 | R40,000 | R100,000 |
| (1-2 agents) | (3-4 agents) | (8-10 agents) |
| **Compliance/Legal** | R10,000 | R20,000 | R40,000 |
| **Marketing** | R20,000 | R60,000 | R150,000 |
| **Office/Admin** | R5,000 | R10,000 | R20,000 |
| **Software Licenses** | R2,000 | R5,000 | R10,000 |
| **TOTAL OPS** | **R52,000** | **R135,000** | **R320,000** |

---

## Profit & Loss (Month 6 Projection)

### Conservative Scenario

| Line Item | Amount |
|-----------|--------|
| **Gross Merchandise Value (GMV)** | R6,300,000 |
| Platform Revenue (5%) | R315,000 |
| **Costs:** |
| Payment Processing (2.03%) | -R127,890 |
| Technology | -R8,800 |
| Banking/Transfers | -R1,600 |
| Operations | -R52,000 |
| **Total Costs** | **-R190,290** |
| **Net Profit** | **R124,710** |
| **Net Margin** | **39.6%** |

### Moderate Scenario

| Line Item | Amount |
|-----------|--------|
| **GMV** | R18,900,000 |
| Platform Revenue (5%) | R945,000 |
| **Costs:** |
| Payment Processing | -R383,670 |
| Technology | -R31,000 |
| Banking/Transfers | -R3,200 |
| Operations | -R135,000 |
| **Total Costs** | **-R552,870** |
| **Net Profit** | **R392,130** |
| **Net Margin** | **41.5%** |

### Aggressive Scenario

| Line Item | Amount |
|-----------|--------|
| **GMV** | R63,000,000 |
| Platform Revenue (5%) | R3,150,000 |
| **Costs:** |
| Payment Processing | -R1,278,900 |
| Technology | -R91,000 |
| Banking/Transfers | -R8,000 |
| Operations | -R320,000 |
| **Total Costs** | **-R1,697,900** |
| **Net Profit** | **R1,452,100** |
| **Net Margin** | **46.1%** |

---

## Unit Economics

### Per-Order Breakdown (Average R350 order)

| Item | Amount | % of Order |
|------|--------|-----------|
| Order Value | R350.00 | 100% |
| Platform Commission | R17.50 | 5% |
| Payment Processing | -R7.11 | 2.03% |
| WhatsApp Message (avg) | -R0.20 | 0.06% |
| Other Tech | -R0.10 | 0.03% |
| **Net Per Order** | **R10.09** | **2.88%** |

**Break-even:** ~174 orders/month  
**At 1,000 orders/month:** R10,090 profit  
**At 10,000 orders/month:** R100,900 profit  
**At 50,000 orders/month:** R504,500 profit  

---

## Friday Payout Example

### Week of Jan 20-26, 2026

**Business: Premium Meat Butchery**

| Order # | Date | Amount | Platform Fee (5%) | Business Gets |
|---------|------|--------|------------------|---------------|
| ORD-001 | Mon | R450 | R22.50 | R427.50 |
| ORD-002 | Mon | R380 | R19.00 | R361.00 |
| ORD-003 | Tue | R520 | R26.00 | R494.00 |
| ORD-004 | Wed | R290 | R14.50 | R275.50 |
| ORD-005 | Thu | R410 | R20.50 | R389.50 |
| ORD-006 | Fri | R330 | R16.50 | R313.50 |
| ORD-007 | Sat | R470 | R23.50 | R446.50 |
| ORD-008 | Sun | R550 | R27.50 | R522.50 |
| **TOTAL** | | **R3,400** | **R170** | **R3,230** |

**Friday Jan 31 Payout:** R3,230  
**Platform Keeps:** R170  

---

## Revenue Optimization Strategies

### 1. Premium Business Tier
- **Standard:** 5% commission
- **Premium:** 3% commission + R500/month
- **Benefits:** Featured placement, analytics, promotions

**When to offer:** After 50+ businesses

### 2. Value-Added Services (Future)
- Advertising/promotion slots: R500-2000/month
- Advanced analytics: R200/month
- Priority support: R300/month
- Custom branding: R500 setup

### 3. Customer Subscriptions (Future)
- "Premium Customer": R99/month
- Benefits: Free delivery, priority support, exclusive deals
- Revenue: 1,000 subscribers = R99,000/month

---

## Investment Requirements

### Minimum Viable Product (MVP)
**Timeline:** 2-3 months  
**Cost:** R150,000 - R250,000

**Breakdown:**
- Development: R100,000
- Legal/Compliance: R20,000
- Initial Marketing: R30,000
- Operations Setup: R20,000
- Contingency: R30,000

### Scale Phase
**Timeline:** Months 4-12  
**Cost:** R500,000 - R1,000,000

**Breakdown:**
- Team expansion: R400,000
- Marketing: R300,000
- Technology: R150,000
- Working capital: R150,000

---

## Break-Even Analysis

### Monthly Break-Even Point

**Fixed Costs:** ~R60,000/month (conservative)  
**Variable Cost per Order:** R7.41  
**Revenue per Order:** R17.50 (5% of R350)  
**Contribution per Order:** R10.09  

**Break-even orders:** 60,000 / 10.09 = **5,948 orders/month**  
**At 20 businesses:** 298 orders/business/month (~10/day)  
**At 50 businesses:** 119 orders/business/month (~4/day)  

**Achievable in Month 2-3 with proper marketing**

---

## ROI Projections

### Conservative Scenario (R200k investment)

| Month | Cumulative Revenue | Cumulative Costs | Net Position |
|-------|-------------------|------------------|--------------|
| 3 | R165,000 | R230,000 | -R65,000 |
| 6 | R650,000 | R420,000 | +R230,000 |
| 12 | R3,500,000 | R1,200,000 | +R2,300,000 |

**ROI at Month 12:** 1,150%  
**Payback Period:** 4-5 months  

### Moderate Scenario (R500k investment)

| Month | Cumulative Revenue | Cumulative Costs | Net Position |
|-------|-------------------|------------------|--------------|
| 3 | R600,000 | R700,000 | -R100,000 |
| 6 | R3,000,000 | R1,800,000 | +R1,200,000 |
| 12 | R10,000,000 | R4,500,000 | +R5,500,000 |

**ROI at Month 12:** 1,000%  
**Payback Period:** 3-4 months  

---

## Risk Factors & Mitigation

### Risk 1: Low Merchant Adoption
**Impact:** Revenue below projections  
**Mitigation:**
- Zero onboarding fees
- First 100 orders commission-free
- Referral bonuses (R500 per business)

### Risk 2: High Payment Processing Costs
**Impact:** Reduces net margin  
**Mitigation:**
- Negotiate volume discounts with Ozow/Yoco
- Encourage EFT payments (lower fees)
- Pass through costs transparently

### Risk 3: Customer Acquisition Cost
**Impact:** High marketing spend  
**Mitigation:**
- Focus on merchant-driven acquisition (QR codes)
- Word-of-mouth incentives
- Business-funded promotions

### Risk 4: Regulatory Compliance
**Impact:** Additional costs, delays  
**Mitigation:**
- Legal review before launch
- Compliance built into onboarding
- Insurance coverage
- Clear liability waivers

---

## Funding Strategy

### Bootstrap Phase (Recommended)
- Self-fund MVP development
- Limit fixed costs
- Revenue-funded growth
- Maintain profitability focus

### Seed Funding (If needed)
- **Amount:** R1-2M
- **Use:** Marketing, team expansion
- **Traction needed:** 50+ businesses, R500k+ monthly GMV
- **Valuation:** R10-15M

### Series A (Future)
- **Amount:** R10-20M
- **Use:** National expansion, product development
- **Traction needed:** 500+ businesses, R50M+ monthly GMV
- **Valuation:** R100M+

---

## Key Success Metrics

### Month 1-3 (MVP Validation)
- 10-20 businesses onboarded
- 1,000+ orders processed
- 4.0+ average business rating
- Break-even or near break-even

### Month 4-6 (Product-Market Fit)
- 50+ businesses
- 15,000+ orders/month
- R100k+ monthly profit
- <5% merchant churn

### Month 7-12 (Scale)
- 100+ businesses
- 50,000+ orders/month
- R500k+ monthly profit
- Expansion to new cities

---

**This model demonstrates a highly profitable, scalable business with quick payback and strong unit economics.**

Want me to create a pitch deck or detailed financial spreadsheet?
