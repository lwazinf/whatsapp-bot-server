# 📱 Complete User Journey - KYC, Location & QR Verification

## 🎯 Overview

This document outlines the complete customer and merchant journey including:
- Customer KYC (contact details, location)
- Business KYB (banking, legal compliance)
- Order QR code verification
- Friday payout system
- Legal liability protection

---

## 👤 CUSTOMER JOURNEY

### Phase 1: First-Time User Setup

#### Step 1: Initial Message
```
User: "Hi"

Bot: "👋 Welcome to [PLATFORM_NAME]!

To get started, I need to collect some information.

This is required for delivery and customer protection.

Let's begin! 
Type 'start' to continue."
```

#### Step 2: Terms Acceptance
```
Bot: "📜 Terms & Conditions

Please read our terms: 
https://platform.com/terms

⚠️ Important: This platform connects you with independent businesses. We are not responsible for product quality, safety, or delivery issues.

We only:
✅ Process payments
✅ Facilitate communication
✅ Handle data securely

Do you accept these terms?
[Accept] [Decline]"
```

#### Step 3: Basic Information
```
Bot: "✅ Terms accepted!

Now I need your details:

1️⃣ Full Name:
(As it appears on your ID)"

User: "John Smith"

Bot: "2️⃣ ID Number:
(For age verification & fraud prevention)"

User: "9001015800089"

Bot: "3️⃣ Email Address:
(For order confirmations)"

User: "john@email.com"
```

#### Step 4: Default Address
```
Bot: "4️⃣ Delivery Address:

Please provide your primary delivery address:

Street Address:"

User: "123 Main Road"

Bot: "City:"
User: "Johannesburg"

Bot: "Postal Code:"
User: "2000"
```

#### Step 5: Location Pin
```
Bot: "📍 Almost done!

For accurate delivery, please share your exact location:

📎 Click 'Attach' → 'Location' → Share your current location

Or I can use your saved address.

[Share Location] [Use Address]"

--- User shares location via WhatsApp ---

Bot: "✅ Location received!

📍 Latitude: -26.2041
📍 Longitude: 28.0473

Your profile is complete! 

Now let's find a business to order from."
```

---

### Phase 2: Accessing a Business

#### Scenario A: QR Code Scan
```
--- User visits physical store, sees QR code ---
--- User sends photo or caption: qr:ABC123 ---

Bot: "📸 QR Code Scanned!

🏪 Welcome to *Premium Meat Butchery*

[Custom welcome message from business owner]:
"Welcome! We pride ourselves on fresh, quality meats. 
All our beef is locally sourced and halal certified.

Free delivery on orders over R500!
⏰ Order before 3pm for same-day delivery.

Ready to order? Browse our menu below! 🥩"

[Browse Menu] [View Specials]"
```

#### Scenario B: Search
```
User: "meat delivery"

Bot: "🔍 Found 3 businesses:

1. Premium Meat Butchery (4.8⭐)
2. Joe's Halal Meats (4.5⭐)
3. Fresh Cuts Co (4.7⭐)

Select one:"

User: "1"

Bot: [Shows same welcome message as QR scan]
```

---

### Phase 3: Ordering Process

#### Step 1: Browse & Add to Cart
```
Bot: "📖 Categories:

[🐄 Beef] [🐔 Chicken] [🐷 Pork] [🔥 BBQ Packs]"

User: Clicks "Beef"

Bot: "🐄 BEEF

1. Ribeye Steak - R199/kg
2. Beef Mince - R89/kg
3. T-Bone - R179/kg

Select a product:"

User: "1"

Bot: "🥩 *Ribeye Steak* - R199/kg

Premium quality, well-marbled.

How many kg?
[0.5kg] [1kg] [2kg] [Custom]"

User: "2kg"

Bot: "✅ Added 2kg Ribeye Steak (R398)

[Continue Shopping] [View Cart] [Checkout]"
```

#### Step 2: View Cart
```
Bot: "🛒 *Your Cart* - Premium Meat Butchery

• Ribeye Steak
  2kg × R199 = R398

Subtotal: R398
Delivery: R30
Platform Fee: R20
─────────────
Total: R448

[Proceed to Checkout] [Edit Cart]"
```

#### Step 3: Delivery Location Confirmation
```
Bot: "📍 Delivery Location

Current address:
123 Main Road, Johannesburg

Is this correct?

[✅ Correct] [📍 Change Location] [🏪 Pickup Instead]"
```

**If "Change Location":**
```
Bot: "📍 Please share your delivery location:

📎 Attach → Location → Send"

--- User shares new location ---

Bot: "✅ New location saved!

📍 456 Oak Avenue, Sandton

Delivery fee updated: R40

Continue to payment?"
```

**If "Pickup Instead":**
```
Bot: "🏪 Pickup Selected

No delivery fee!

📍 Pickup Location:
Premium Meat Butchery
78 Market Street, Johannesburg

New Total: R418

Continue to payment?"
```

#### Step 4: Payment
```
Bot: "💳 Select Payment Method:

[🏦 Bank (Ozow)] [💳 Card (Yoco)]"

User: Clicks "Bank"

Bot: "✅ Payment link generated!

Order #ORD-ABC123XYZ
Total: R448

Click to pay:
https://pay.ozow.com/abc123...

⏱️ Link expires in 30 minutes

I'll notify you once payment is confirmed!"
```

---

### Phase 4: Order Tracking & QR Verification

#### After Payment Confirmed
```
Bot: "✅ *Payment Confirmed!*

Order #ORD-ABC123XYZ
Amount: R448

📦 *Your Order QR Code*

[QR CODE IMAGE SENT]

⚠️ IMPORTANT: 
Save this QR code! The driver will need to scan it to complete your delivery.

Current Status: Preparing 👨‍🍳

I'll keep you updated!"
```

#### Status Updates
```
--- 15 minutes later ---
Bot: "✅ Order Ready!

Your order is ready for delivery.

Estimated arrival: 45 minutes

Track status: https://platform.com/order/abc123"

--- 30 minutes later ---
Bot: "🚚 Out for Delivery!

Driver: Thabo M.
Vehicle: White Toyota Hilux (CA 123 GP)
Phone: 072 123 4567

Arriving in 15 minutes!"
```

#### Delivery Completion (QR Scan Required)
```
--- Driver arrives at customer location ---

Driver (via platform app): Scans customer's order QR code

--- System verifies QR code matches order ---

Bot → Customer: "✅ *Delivery Complete!*

Order #ORD-ABC123XYZ delivered at 14:35

📍 Location: -26.2041, 28.0473

Driver confirmed delivery via QR scan.

Enjoy your order! 🥩

Rate your experience:
⭐⭐⭐⭐⭐"

Bot → Business: "✅ Order ORD-ABC123XYZ completed
Payment will be released Friday."
```

---

## 🏪 BUSINESS/MERCHANT JOURNEY

### Phase 1: Business Application & KYB

#### Step 1: Initial Application
```
Business Owner: "I want to register my business"

Bot: "🏪 *Business Registration*

Great! Let's get your business on our platform.

📋 Required Information:
✅ Business details
✅ Owner verification (KYC)
✅ Banking details
✅ Legal documents

This takes about 10 minutes.

Ready to start?
[Yes] [Not Now]"
```

#### Step 2: Business Information
```
Bot: "1️⃣ Business Name:"
Owner: "Premium Meat Butchery"

Bot: "2️⃣ Business Type:
[Sole Proprietor]
[Partnership]  
[Pty Ltd]
[Other]"

Owner: "Sole Proprietor"

Bot: "3️⃣ Category:
[Meat]
[Restaurant]
[Grocery]
[Bakery]
[Other]"

Owner: "Meat"

Bot: "4️⃣ Business Description:
(What do you sell? What makes you special?)"

Owner: "Fresh, locally-sourced halal meats. Same-day delivery available."

Bot: "5️⃣ Welcome Message:
(This is sent to customers when they enter your store)"

Owner: "Welcome! We specialize in premium halal meats. Free delivery over R500!"
```

#### Step 3: Location & Contact
```
Bot: "6️⃣ Business Phone Number:"
Owner: "011 123 4567"

Bot: "7️⃣ Email Address:"
Owner: "info@premiummeats.co.za"

Bot: "8️⃣ Physical Address:"
Owner: "78 Market Street, Johannesburg, 2000"

Bot: "9️⃣ Share your business location:
📎 Attach → Location"

--- Owner shares location ---

Bot: "✅ Location saved!"
```

#### Step 4: Delivery Settings
```
Bot: "🚚 Delivery Settings:

Do you offer delivery?
[Yes] [No, Pickup Only]"

Owner: "Yes"

Bot: "What's your delivery radius (km)?
Examples: 5, 10, 15"

Owner: "10"

Bot: "Delivery Fee (R):"
Owner: "30"

Bot: "Free delivery threshold (R):
(Orders above this amount get free delivery)"

Owner: "500"

Bot: "Minimum order amount (R):"
Owner: "100"
```

#### Step 5: Owner KYC
```
Bot: "👤 *Owner Verification*

For legal compliance and fraud prevention:

1️⃣ Your Full Legal Name:"
Owner: "John Smith"

Bot: "2️⃣ ID Number:"
Owner: "7805125800089"

Bot: "3️⃣ Upload ID Document:
📎 Attach → Photo of your ID"

--- Owner sends ID photo ---

Bot: "✅ ID received!"
```

#### Step 6: Banking Details (Critical!)
```
Bot: "🏦 *Banking Information*

This is where we'll pay you every Friday.

⚠️ IMPORTANT: 
- Payouts happen every Friday
- We deduct 5% platform fee
- First payout after 7 business days

1️⃣ Bank Name:
[ABSA] [FNB] [Standard Bank] [Nedbank] [Capitec] [Other]"

Owner: "FNB"

Bot: "2️⃣ Account Type:
[Savings] [Current] [Business]"

Owner: "Business"

Bot: "3️⃣ Account Number:"
Owner: "62123456789"

Bot: "4️⃣ Branch Code:
(FNB business accounts usually 250655)"

Owner: "250655"

Bot: "5️⃣ Account Holder Name:
(Must match your ID)"

Owner: "John Smith"

Bot: "6️⃣ Upload Bank Proof:
(Bank statement or letter - last 3 months)
📎 Attach"

--- Owner sends bank statement ---

Bot: "✅ Banking details received!

We'll verify these within 2 business days."
```

#### Step 7: Legal Documents
```
Bot: "📄 *Business Documents*

These are required for compliance:

1️⃣ Registered Business?
[Yes - I have CIPC registration]
[Yes - I have Tax registration]
[No - Informal business]"

Owner: "Yes - CIPC"

Bot: "2️⃣ CIPC Registration Number:"
Owner: "2018/123456/07"

Bot: "3️⃣ Upload CIPC Certificate:
📎 Attach"

--- Owner sends document ---

Bot: "4️⃣ VAT Registered?
[Yes] [No]"

Owner: "Yes"

Bot: "5️⃣ VAT Number:"
Owner: "4123456789"

Bot: "6️⃣ Upload Tax Clearance Certificate:
(Optional but recommended)
📎 Attach or [Skip]"
```

#### Step 8: Terms Agreement
```
Bot: "📜 *Merchant Agreement*

Please read carefully:

🔗 https://platform.com/merchant-terms

*Key Points:*
- Platform fee: 5% per transaction
- Payout schedule: Every Friday
- Minimum payout: R100
- You are responsible for:
  ✅ Product quality & safety
  ✅ Delivery timing
  ✅ Customer service
  ✅ Legal compliance

*We are responsible for:*
  ✅ Payment processing
  ✅ Platform maintenance
  ✅ Data security

⚠️ IMPORTANT:
The platform holds NO liability for:
❌ Product quality issues
❌ Food safety concerns
❌ Delivery problems
❌ Customer disputes

By accepting, you agree that [PLATFORM_NAME] is only a marketplace facilitator.

Do you accept these terms?
[Accept] [Decline]"
```

#### Step 9: Application Submitted
```
Bot: "✅ *Application Submitted!*

Your business: *Premium Meat Butchery*

📋 Review Status: Under Review
⏱️ Review Time: 2-5 business days

What happens next:
1️⃣ We verify your documents
2️⃣ We verify your bank account
3️⃣ We activate your store
4️⃣ You can start taking orders!

Your QR Code (save this!):
[QR CODE IMAGE]

QR Code: PM-ABC123

Give this to customers to access your store instantly!

We'll notify you once approved.

Questions? Reply 'help'"
```

---

### Phase 2: Business Operations

#### Order Notifications
```
--- Customer places order ---

Bot → Business: "🛎️ *New Order!*

Order #ORD-XYZ789
Customer: Jane Doe (072 555 1234)
Total: R448

Items:
• Ribeye Steak 2kg - R398

Delivery Address:
123 Main Road, Johannesburg
📍 5.2km away

Expected prep time: 30 min
Expected delivery: 60 min

[Accept] [Reject]"

Owner: "Accept"

Bot: "✅ Order accepted!

Customer notified.

Update order status:
[Preparing] [Ready] [Dispatched]"
```

#### Payout Notifications
```
--- Every Thursday night ---

Bot → Business: "💰 *Payout Summary*

Week ending: 24 Jan 2026

Total Orders: 47
Gross Revenue: R23,450
Platform Fee (5%): -R1,172.50
───────────────────
Net Payout: R22,277.50

Will be paid tomorrow (Friday) to:
FNB - *****6789

View detailed report:
https://platform.com/business/payouts"

--- Friday 9am ---

Bot → Business: "✅ *Payout Complete!*

Amount: R22,277.50
Paid to: FNB *****6789
Reference: PAY-20260124-PM

Check your bank account.

Questions? Reply 'support'"
```

---

## 🔐 QR CODE VERIFICATION FLOW

### How It Works

**Order QR Code Generation:**
```typescript
// When order is paid
orderQrCode = generateUniqueCode(); // "ORD-ABC123-VERIFY-XYZ789"

// Generate QR image containing:
{
  orderId: "uuid-here",
  orderNumber: "ORD-ABC123XYZ",
  verificationCode: "XYZ789",
  customerId: "user-id",
  businessId: "business-id",
  amount: 448.00,
  timestamp: "2026-01-27T14:00:00Z"
}

// Send QR to customer via WhatsApp
sendWhatsAppImage(customer.phone, qrCodeImage);
```

**Driver Scans QR:**
```typescript
// Driver app scans customer's QR code
scannedData = parseQRCode(image);

// Verify against database
order = await db.order.findUnique({
  where: { orderQrCode: scannedData.verificationCode }
});

if (!order) {
  return "Invalid QR code";
}

if (order.status !== "OUT_FOR_DELIVERY") {
  return "Order not ready for delivery";
}

// Get driver's GPS location
driverLocation = getGPSCoordinates();

// Calculate distance from customer
distance = calculateDistance(
  driverLocation,
  { lat: order.deliveryLat, lng: order.deliveryLng }
);

if (distance > 100) { // meters
  return "You must be at delivery location to scan";
}

// All checks passed - complete order
await db.order.update({
  where: { id: order.id },
  data: {
    status: "COMPLETED",
    qrScannedBy: driver.id,
    qrScannedAt: new Date(),
    qrScanLocation: driverLocation,
    completedAt: new Date()
  }
});

// Notify customer
sendWhatsApp(customer.phone, "Order delivered! ✅");

// Release payment to business (will be paid Friday)
await updateBusinessBalance(order.businessId, order.businessEarnings);
```

---

## 💰 FRIDAY PAYOUT SYSTEM

### How It Works

**Monday to Thursday:**
```
- Orders completed
- Money held in platform escrow
- Business balance updates daily
```

**Thursday Night (11:59 PM):**
```sql
-- Calculate each business's payout
SELECT 
  business_id,
  SUM(business_earnings) as payout_amount,
  COUNT(*) as total_orders
FROM orders
WHERE 
  status = 'COMPLETED' 
  AND completed_at >= 'last_friday' 
  AND completed_at < 'this_friday'
  AND payout_id IS NULL
GROUP BY business_id;
```

**Friday Morning (9:00 AM):**
```typescript
// For each business with earnings >= R100
for (const business of businesses) {
  // Create payout record
  const payout = await createPayout({
    businessId: business.id,
    amount: business.weeklyEarnings,
    bankDetails: business.bankDetails,
    orders: business.completedOrders
  });
  
  // Initiate bank transfer
  await initiateEFT({
    toAccount: business.accountNumber,
    amount: business.weeklyEarnings,
    reference: `PAYOUT-${business.id}-${date}`,
    narration: `[PLATFORM] Weekly payout`
  });
  
  // Send notification
  await sendWhatsApp(
    business.phone,
    `💰 Payout of R${business.weeklyEarnings} sent to your bank!`
  );
  
  // Mark orders as paid out
  await markOrdersAsPaidOut(business.completedOrders);
}
```

---

## 📋 DATA REQUIRED SUMMARY

### **Customer Must Provide:**
✅ Full name
✅ ID number
✅ Email
✅ Physical address
✅ GPS location (for delivery)
✅ Phone number (WhatsApp)
✅ Accept terms & conditions

### **Business Must Provide:**
✅ Business name & description
✅ Owner full name
✅ Owner ID number & document
✅ Business phone & email
✅ Physical address & GPS location
✅ Bank name
✅ Account type
✅ Account number
✅ Branch code
✅ Account holder name
✅ Bank proof (statement/letter)
✅ Registration documents (if registered)
✅ Tax clearance (optional)
✅ Accept merchant agreement

---

## ⚖️ LEGAL PROTECTION

### Platform Liability Waiver (in Terms)

```
LIMITATION OF LIABILITY

1. PLATFORM ROLE
   [PLATFORM_NAME] operates as a marketplace facilitator only.
   We connect customers with independent merchants.

2. MERCHANT RESPONSIBILITY
   Each merchant is solely responsible for:
   - Product quality, safety, and freshness
   - Compliance with health regulations
   - Accurate product descriptions
   - Delivery timing and conditions
   - Customer service and support
   - Dispute resolution

3. PLATFORM SERVICES
   We provide only:
   - Payment processing and settlements
   - Data storage and security
   - Communication platform
   - Technology infrastructure

4. NO LIABILITY
   [PLATFORM_NAME] holds NO liability for:
   - Product quality or safety issues
   - Foodborne illness or allergic reactions
   - Delivery delays or errors
   - Merchant misconduct
   - Product misrepresentation
   - Customer-merchant disputes
   - Financial losses related to products/services

5. CUSTOMER ACKNOWLEDGMENT
   By using this platform, customers acknowledge that:
   - They are transacting directly with merchants
   - The platform is not the seller
   - All disputes are between customer and merchant
   - Platform involvement is limited to facilitation

6. INDEMNIFICATION
   Merchants agree to indemnify and hold harmless [PLATFORM_NAME]
   from any claims, damages, or losses arising from their products,
   services, or business operations.
```

**This protects your company legally while providing a valuable service!**

Want me to create the actual terms & conditions document or build the implementation code?
