# 🎯 Feature Engineering - Business Model Breakdown

## Overview
This document explains every field in the enhanced business model and why it's needed.

---

## 📊 BUSINESS CORE FEATURES

### **Business Type & Registration**

#### `businessType` (enum)
**Purpose:** Legal entity classification for compliance and taxation
**Options:**
- `SOLE_PROPRIETOR` - Single owner, simplest structure
- `PARTNERSHIP` - Multiple owners sharing profits
- `PRIVATE_COMPANY` - Pty Ltd, limited liability
- `PUBLIC_COMPANY` - Public Ltd, can issue shares
- `COOPERATIVE` - Member-owned
- `NON_PROFIT` - Charity/NGO
- `FRANCHISE` - Part of larger brand

**Why needed:**
- Tax calculation (different rates)
- Liability insurance requirements
- Compliance documentation
- Platform fee structure

#### `registrationType` (enum)
**Purpose:** Track formal business registration status
**Options:**
- `UNREGISTERED` - Informal business
- `CIPC_REGISTERED` - Company registered with CIPC
- `SARS_REGISTERED` - Tax registration only
- `BOTH` - Fully registered

**Why needed:**
- Determines which documents required
- Affects payment processing (VAT)
- Compliance verification
- Trust indicators for customers

#### `registrationNumber` & `taxNumber`
**Purpose:** Official government identifiers
**Usage:**
- Invoice generation (must include VAT number)
- Legal compliance
- Fraud prevention
- Verification process

---

### **Business Identity & Branding**

#### `tagline` vs `description` vs `story`
**Tagline:** One-liner (e.g., "Fresh cuts, delivered fast")
**Description:** 2-3 sentences about what you offer
**Story:** Full "About Us" narrative

**Why separate:**
- Tagline: Search results, mobile view
- Description: Business card view
- Story: Full business page

#### `brandColor` (hex)
**Purpose:** Theme WhatsApp messages and future web/app UI
**Example:** `#E63946` (red for meat shop)
**Usage:**
- Button colors in interactive messages
- Business card styling
- Future branded ordering page

#### `gallery` (array)
**Purpose:** Multiple business images
**Usage:**
```json
[
  "https://cdn.example.com/store-front.jpg",
  "https://cdn.example.com/meat-display.jpg",
  "https://cdn.example.com/team.jpg"
]
```
**Why needed:**
- Build trust with visuals
- Showcase products/environment
- SEO optimization (future web presence)

---

### **Category & Discovery**

#### `category` vs `subcategories` vs `tags`
```
category: "meat"
subcategories: ["halal", "organic", "premium"]
tags: ["fast-delivery", "bulk-orders", "custom-cuts"]
```

**Why layered:**
- **Category:** Primary classification (search faceting)
- **Subcategories:** Filter options ("Show only halal meat shops")
- **Tags:** Behavioral/feature indicators (sort by "fast-delivery")

**Search example:**
```
User searches: "organic halal meat"
Matches:
  category: meat + 
  subcategories: [organic, halal]
```

---

### **Location & Service Area**

#### `address` → `city` → `province` → `postalCode`
**Why separate fields:**
- Structured search: "All businesses in Johannesburg"
- Delivery zone calculation
- Regional analytics
- Tax jurisdiction

#### `latitude` & `longitude`
**Purpose:** Precise location mapping
**Usage:**
- Calculate delivery distance
- Map display (future feature)
- "Businesses near me" search
- Delivery fee calculation based on distance

#### `deliveryRadius` (km)
**Purpose:** Maximum delivery distance
**Example:** `10.5` km
**Logic:**
```typescript
if (distance(customer, business) <= deliveryRadius) {
  canDeliver = true;
}
```

#### `serviceAreas` vs `deliveryZones`
**serviceAreas (simple):**
```json
["Johannesburg", "Sandton", "Rosebank"]
```

**deliveryZones (complex):**
```json
{
  "Sandton": { "fee": 30, "minOrder": 200 },
  "Rosebank": { "fee": 40, "minOrder": 250 },
  "Soweto": { "fee": 60, "minOrder": 300 }
}
```

**Why both:**
- serviceAreas: Simple list for display
- deliveryZones: Dynamic pricing logic

---

### **Business Status & Verification**

#### `status` (enum)
**Lifecycle states:**
```
PENDING → ACTIVE ←→ SUSPENDED
            ↓
         INACTIVE
            ↓
         CLOSED
```

**Business rules:**
- `PENDING`: Can't take orders, awaiting verification
- `ACTIVE`: Fully operational
- `SUSPENDED`: Admin action (policy violation)
- `INACTIVE`: Business choice (vacation mode)
- `CLOSED`: Permanently shut down

#### `isVerified` + `verifiedAt`
**Purpose:** Trust badge
**Criteria for verification:**
- ✅ Valid business documents
- ✅ Completed 10+ successful orders
- ✅ Rating ≥ 4.0
- ✅ No policy violations

#### `isFeatured` + `isPremium`
**Monetization tiers:**
- **Featured:** Top placement in search (pay per month)
- **Premium:** Additional features (analytics, promotions, lower platform fee)

**Revenue model:**
```
Standard: 5% platform fee
Premium:  3% platform fee + R500/month
```

---

## 👥 OWNERSHIP & TEAM FEATURES

### **BusinessOwner Model**

#### `role` (enum)
**Purpose:** Permission hierarchy
```
OWNER:      Full control (delete business, manage owners)
CO_OWNER:   Shared ownership, can't remove other owners
MANAGER:    Day-to-day ops, can't change business settings
STAFF:      View-only + manage orders
```

#### `permissions` (array)
**Purpose:** Granular access control
**Examples:**
```json
[
  "manage_products",
  "view_orders",
  "process_refunds",
  "view_analytics",
  "manage_promotions",
  "respond_to_reviews"
]
```

#### `equity` (decimal)
**Purpose:** Ownership percentage
**Usage:**
- Profit sharing calculations
- Decision-making rights
- Partnership disputes
- Exit scenarios

**Example:**
```
User A: 60% equity (OWNER)
User B: 30% equity (CO_OWNER)
User C: 10% equity (CO_OWNER)
```

---

## ⏰ OPERATING HOURS FEATURES

### **OperatingHours Model**

#### Split Shifts Support
**Problem:** Many businesses have lunch breaks
**Solution:**
```typescript
{
  dayOfWeek: 1, // Monday
  openTime: "09:00",
  closeTime: "14:00",
  secondOpenTime: "17:00",
  secondCloseTime: "22:00"
}
```

**Display:** "Mon: 9am-2pm, 5pm-10pm"

#### Why `isClosed` separate from null hours
**Flexibility:**
```typescript
// Closed but with note
{
  isClosed: true,
  note: "Closed for inventory"
}

// vs permanently no hours
{ hours: null }
```

### **BusinessHoliday Model**

#### `isRecurring`
**Purpose:** Annual holidays
**Example:**
```typescript
{
  name: "Christmas Day",
  date: "2026-12-25",
  isRecurring: true  // Auto-applies every year
}

{
  name: "Staff Training",
  date: "2026-03-15",
  isRecurring: false  // One-time event
}
```

---

## 📦 PRODUCT FEATURES

### **Pricing Structure**

#### `price` vs `costPrice` vs `compareAtPrice`
```
costPrice:      R80 (what you pay supplier)
price:          R120 (what customer pays)
compareAtPrice: R150 (original price - shows discount)
```

**Display:**
```
~~R150~~ R120 (20% off!)
Profit margin: R40 (33%)
```

### **Units & Measurements**

#### `minQuantity`, `maxQuantity`, `increment`
**Use case: Meat shop**
```typescript
{
  name: "Beef Mince",
  unit: "kg",
  minQuantity: 0.5,   // Can't order less than 500g
  maxQuantity: 10,    // Max 10kg per order
  increment: 0.5      // Order in 500g increments
}
```

**UI:** Quantity buttons: [0.5kg] [1.0kg] [1.5kg] ... [10kg]

#### `weight` & `volume`
**Purpose:** Shipping calculations & nutrition facts
```typescript
{
  name: "Chicken Breast Pack",
  weight: 1000,  // grams
  price: 89.99
}

// Shipping cost based on total weight
totalWeight = sum(items.map(i => i.weight * i.quantity))
```

### **Stock Management**

#### `trackStock` flag
**Why optional:**
- Butchery: Stock changes constantly → trackStock: false
- Packaged goods: Fixed inventory → trackStock: true

#### `lowStockThreshold`
**Purpose:** Auto-alert when running low
```typescript
if (stockCount <= lowStockThreshold) {
  notifyOwner("Restock needed: Beef Ribeye");
}
```

### **Product Discovery Features**

#### `isFeatured`, `isNewArrival`, `isBestseller`
**Use cases:**
- **Featured:** Premium placement (paid or owner choice)
- **New Arrival:** Badge for products <30 days old
- **Bestseller:** Auto-set if salesCount > threshold

#### `sortOrder`
**Purpose:** Manual product arrangement
```typescript
// Owner drags products in preferred order
products.orderBy({ sortOrder: 'asc' })
```

### **Nutritional Info** (JSON)
**Structure:**
```json
{
  "servingSize": "100g",
  "calories": 250,
  "protein": 26,
  "fat": 15,
  "carbs": 0,
  "sodium": 75
}
```

**Why JSON:** Flexible schema for different product types

---

## 🛒 ORDER FEATURES

### **Order Amounts Breakdown**

```
subtotal:     R300 (products)
deliveryFee:  R30
serviceFee:   R15  (platform commission)
discount:     -R50 (promo code)
tax:          R45  (15% VAT)
tip:          R20  (optional)
───────────────────
grandTotal:   R360
```

#### `serviceFee` vs `platformFee`
**serviceFee:** Charged to customer (transparent)
**platformFee:** Deducted from business payment (backend)

### **Order Priority**

#### `priority` (enum)
```
LOW:     Standard orders (1-2 hours)
NORMAL:  Default
HIGH:    Rush orders (+R20 fee)
URGENT:  VIP/large orders (immediate attention)
```

**Usage:**
- Queue sorting
- Kitchen display prioritization
- Driver assignment

### **Fulfillment Types**

#### `fulfillmentType` (enum)
```
DELIVERY:  Standard delivery
PICKUP:    Customer collects
DINE_IN:   For restaurants (future)
```

**Why needed:**
- Different flows (no delivery address for pickup)
- Different fees (no delivery fee for pickup)
- Analytics (conversion rates per type)

#### `scheduledFor` (datetime)
**Use case:** Pre-orders
```
"I want this delivered tomorrow at 2pm"
scheduledFor: 2026-01-28T14:00:00Z
```

**Business logic:**
- Don't prepare until scheduled time approaches
- Delivery window planning
- Kitchen scheduling

### **Payment Status Tracking**

#### Separate `status` and `paymentStatus`
**Why both:**
```
Order status:    CONFIRMED (kitchen started)
Payment status:  PENDING (customer hasn't paid yet)

→ Risk: Need to track both independently
```

**Scenarios:**
```
CONFIRMED + PENDING  = COD order or payment pending
CONFIRMED + COMPLETED = Fully paid, in progress
DELIVERED + PENDING  = Delivered but COD not collected
CANCELLED + REFUNDED = Order cancelled, money returned
```

### **Timestamps for Analytics**

```
createdAt:     Order placed
confirmedAt:   Business accepted
preparingAt:   Kitchen started
readyAt:       Ready for pickup/delivery
dispatchedAt:  Driver collected
deliveredAt:   Customer received
```

**Analytics use:**
```
avgPrepTime = avg(readyAt - preparingAt)
avgDeliveryTime = avg(deliveredAt - dispatchedAt)
fulfillmentRate = count(deliveredAt) / count(createdAt)
```

---

## ⭐ REVIEW FEATURES

### **Multi-Aspect Ratings**

#### Overall `rating` + specific aspects
```typescript
{
  rating: 4,           // Overall (1-5)
  foodQuality: 5,      // Loved the taste
  deliverySpeed: 3,    // Bit slow
  packaging: 5,        // Well packaged
  value: 4             // Fair price
}
```

**Why detailed:**
- Business insights (what to improve)
- Customer decision-making
- Competitor comparison

#### `isVerified` badge
**Criteria:** User must have completed order
**Display:** "✓ Verified Purchase"
**Trust factor:** +40% credibility

---

## 🎁 PROMOTION FEATURES

### **Promotion Types**

```typescript
enum PromotionType {
  PERCENTAGE,     // "20% off"
  FIXED_AMOUNT,   // "R50 off"
  FREE_DELIVERY,  // "Free delivery on orders R300+"
  BUY_X_GET_Y     // "Buy 2kg, get 500g free"
}
```

#### `usageLimit` + `usageCount`
**Purpose:** Prevent abuse
```typescript
{
  code: "SAVE20",
  usageLimit: 100,    // First 100 customers
  usageCount: 67      // 67 have used it
}
```

#### `minOrderAmount` + `maxDiscount`
**Business protection:**
```typescript
{
  code: "BIGDISCOUNT",
  type: "PERCENTAGE",
  value: 50,              // 50% off
  minOrderAmount: 500,    // Must spend R500+
  maxDiscount: 100        // Max R100 discount
}

// Without maxDiscount:
// R2000 order = R1000 discount (unsustainable!)
// With maxDiscount:
// R2000 order = R100 discount (capped)
```

---

## 📢 ANNOUNCEMENT FEATURES

### **Announcement Types**

```typescript
enum AnnouncementType {
  INFO,         // "New menu items available"
  WARNING,      // "Experiencing delivery delays"
  PROMOTION,    // "Weekend special: 20% off"
  HOLIDAY,      // "Closed for Christmas"
  MAINTENANCE   // "System upgrade tonight"
}
```

#### `priority` field
**Display order:**
```
priority: 10 → "⚠️ Delivery delays today" (top)
priority: 5  → "🎉 New products!" (middle)
priority: 1  → "Opening hours updated" (bottom)
```

---

## 💡 SUGGESTED ADDITIONAL FEATURES

### **Features I Recommend Adding:**

1. **Business Badges**
   ```prisma
   badges String[] // ["eco-friendly", "woman-owned", "veteran-owned"]
   ```

2. **Language Support**
   ```prisma
   languages String[] // ["en", "af", "zu", "xh"]
   ```

3. **Delivery Methods**
   ```prisma
   deliveryMethods String[] // ["own-drivers", "uber-direct", "mr-d"]
   ```

4. **Payment Methods Display**
   ```prisma
   acceptedPayments String[] // ["cash", "card", "eft", "zapper", "snapscan"]
   ```

5. **Customer Favorites at Business Level**
   ```prisma
   model CustomerPreference {
     userId String
     businessId String
     favoriteProducts String[] // Quick reorder
     dietaryRestrictions String[]
     deliveryInstructions String?
   }
   ```

6. **Business Analytics (built-in)**
   ```prisma
   model BusinessAnalytics {
     businessId String
     date Date
     views Int
     orders Int
     revenue Decimal
     newCustomers Int
     repeatCustomers Int
   }
   ```

7. **Inventory Alerts**
   ```prisma
   model InventoryAlert {
     productId String
     threshold Int
     notifyAt String[] // ["email", "whatsapp", "sms"]
   }
   ```

---

## 🎯 Next Steps

1. **Review schema** - Remove fields you don't need
2. **Add custom fields** - Business-specific requirements
3. **Plan migration** - Upgrade path from current schema
4. **Test with real data** - Seed 5-10 businesses
5. **Build admin UI** - Manage all these fields

Want me to:
- Generate migration script?
- Create admin UI mockups?
- Build business onboarding form?
- Add more features?
