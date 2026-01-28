# 🔄 Complete User Flow - From Entry to Delivery

## Overview
This document details the complete end-to-end flow including KYC, bank details, QR verification, location sharing, and legal liability framework.

---

## 📱 PHASE 1: Initial Contact & Business Discovery

### Step 1: User Opens WhatsApp
```
User → Platform WhatsApp Number
```

### Step 2: Welcome & Terms Acceptance
```
Bot: "Welcome to [Platform Name]! 👋

Before we start, you need to accept our Terms & Conditions.

⚠️ IMPORTANT:
• We connect you with local businesses
• We are NOT responsible for product quality or safety
• Merchants are solely liable for their products/services
• We handle payments and data securely
• Payouts to merchants every Friday

Type 'ACCEPT' to continue or 'READ' to view full terms."
```

**Database Action:**
```typescript
user.acceptedTermsAt = new Date();
user.acceptedTermsVersion = "1.0";
```

### Step 3: Business Selection
```
Bot: "How would you like to find a business?"

[📸 Scan QR Code]  [🔍 Search]  [⭐ Favorites]
```

---

## 🏪 PHASE 2: Enter Business (QR Scan/Search)

### Step 4: Business Entry

**If QR Scan:**
```typescript
// User scans business QR code
qrCode = "A1B2C3D4E5F6"
business = await getBusinessByQRCode(qrCode)
```

**If Search:**
```typescript
// User types: "Premium Meats"
businesses = await searchBusinesses("Premium Meats")
// User selects from results
```

### Step 5: Send Business QR Code + Welcome Message

```typescript
// Generate business entry QR (for reference)
const businessEntryQR = await generateQRCode({
  type: "business_entry",
  businessId: business.id,
  userId: user.id,
  timestamp: Date.now()
});

// Send custom welcome message
const welcomeMsg = business.welcomeMessage || `
🏪 Welcome to ${business.name}!

${business.tagline}

${business.description}
`;

await whatsapp.sendImage(user.phone, businessEntryQR);
await whatsapp.sendText(user.phone, welcomeMsg);
```

**Business Owner Configuration:**
```typescript
// In business settings
welcomeMessage: "Welcome to Joe's Butchery! 🥩
Premium cuts since 1985. 
Family-owned, quality guaranteed.
Order now for same-day delivery!"

welcomeEnabled: true
```

---

## 📍 PHASE 3: Location Sharing (If Delivery)

### Step 6: Check Delivery Option

```typescript
if (business.offersDelivery && business.requiresLocation) {
  await promptForLocation(user.phone);
}
```

### Step 7: Request Location

```
Bot: "📍 Location Required

${business.name} delivers to your area!

Please share your delivery location:

Option 1: 📱 Send your live location via WhatsApp
Option 2: 💾 Use saved location
Option 3: ✍️ Type your address

Delivery zones:
${formatDeliveryZones(business.deliveryZones)}
"
```

**WhatsApp Location Message:**
```typescript
// User sends location via WhatsApp location feature
{
  type: "location",
  latitude: -26.2041,
  longitude: 28.0473,
  accuracy: 15 // meters
}
```

### Step 8: Validate & Store Location

```typescript
async function handleLocation(message) {
  const { latitude, longitude, accuracy } = message.location;
  
  // Check if within delivery radius
  const distance = calculateDistance(
    business.latitude, 
    business.longitude,
    latitude,
    longitude
  );
  
  if (distance > business.deliveryRadius) {
    await whatsapp.sendText(user.phone,
      `😔 Sorry, you're ${distance}km away. We only deliver within ${business.deliveryRadius}km.`
    );
    return false;
  }
  
  // Calculate delivery fee based on zone
  const zone = findDeliveryZone(business.deliveryZones, latitude, longitude);
  const deliveryFee = zone?.fee || business.deliveryFee;
  
  // Save location to session
  await updateSession(user.phone, {
    businessId: business.id,
    deliveryLat: latitude,
    deliveryLng: longitude,
    deliveryZone: zone?.name,
    deliveryFee,
    locationAccuracy: accuracy,
    locationSharedAt: new Date()
  });
  
  await whatsapp.sendText(user.phone,
    `✅ Location confirmed!
    
    Area: ${zone?.name || 'Standard'}
    Distance: ${distance.toFixed(1)}km
    Delivery fee: R${deliveryFee}
    Est. delivery: ${business.estimatedDeliveryTime} mins
    
    [Browse Menu]`
  );
  
  return true;
}
```

### Step 9: Save Location (Optional)

```
Bot: "💾 Would you like to save this location for future orders?

[🏠 Save as Home]  [💼 Save as Work]  [➕ Custom Name]  [⏭️ Skip]
"
```

```typescript
await prisma.savedLocation.create({
  data: {
    userId: user.id,
    label: "Home", // or "Work", or custom
    address: formattedAddress,
    latitude,
    longitude,
    instructions: "Blue gate, ring twice"
  }
});
```

---

## 🛒 PHASE 4: Shopping & Checkout

### Step 10: Browse & Add to Cart
*(Standard shopping flow - already implemented)*

### Step 11: Checkout & Payment Selection

```
Bot: "🛒 Your Cart

${cartItems}

Subtotal: R${subtotal}
Delivery: R${deliveryFee}
Service Fee: R${serviceFee}
Total: R${grandTotal}

Choose payment method:
[🏦 Bank Transfer (Ozow)]  [💳 Card (Yoco)]
"
```

---

## 💳 PHASE 5: Payment & Order QR Generation

### Step 12: Process Payment

```typescript
// Create order (PENDING)
const order = await createOrder({
  userId: user.id,
  businessId: business.id,
  items: cartItems,
  deliveryLat,
  deliveryLng,
  deliveryFee,
  platformFee: grandTotal * (business.platformFeePercentage / 100),
  status: 'PENDING',
  paymentStatus: 'PENDING'
});

// Generate payment link
const paymentUrl = await generatePaymentLink(order, paymentMethod);

await whatsapp.sendText(user.phone,
  `💳 Complete Payment
  
  Order #${order.orderNumber}
  Total: R${order.grandTotal}
  
  Click here to pay:
  ${paymentUrl}
  
  ⏱️ Link expires in 30 minutes`
);
```

### Step 13: Payment Webhook Confirmation

```typescript
// Webhook from Ozow/Yoco
async function handlePaymentWebhook(data) {
  const order = await getOrderByPaymentId(data.paymentId);
  
  if (data.status === 'completed') {
    // Update order
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'COMPLETED',
        status: 'CONFIRMED',
        confirmedAt: new Date()
      }
    });
    
    // GENERATE ORDER QR CODE
    const orderQRCode = nanoid(16).toUpperCase(); // "A1B2C3D4E5F6G7H8"
    const orderQRImage = await QRCode.toDataURL(`order:${orderQRCode}`, {
      width: 600,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    await prisma.order.update({
      where: { id: order.id },
      data: {
        orderQRCode,
        orderQRImage,
        qrGeneratedAt: new Date()
      }
    });
    
    // SEND QR CODE TO CUSTOMER
    await whatsapp.sendImage(user.phone, orderQRImage, 
      `✅ Payment Confirmed!
      
      Order #${order.orderNumber}
      
      📱 IMPORTANT: Save this QR code!
      
      The delivery driver will scan this QR code when they arrive to confirm delivery.
      
      DO NOT show this code to anyone except the driver.
      
      Order Status: Preparing
      Est. delivery: ${business.estimatedDeliveryTime} mins`
    );
    
    // Notify business
    await notifyBusiness(order);
  }
}
```

---

## 📦 PHASE 6: Order Preparation & Dispatch

### Step 14: Business Prepares Order

```typescript
// Business updates status
await prisma.order.update({
  where: { id: order.id },
  data: {
    status: 'PREPARING',
    preparingAt: new Date()
  }
});

// Notify customer
await whatsapp.sendText(user.phone,
  `👨‍🍳 Your order is being prepared!
  
  Order #${order.orderNumber}
  ${business.name}
  
  We'll notify you when it's ready for delivery.`
);
```

### Step 15: Ready for Delivery

```typescript
await prisma.order.update({
  where: { id: order.id },
  data: {
    status: 'READY',
    readyAt: new Date()
  }
});

await whatsapp.sendText(user.phone,
  `✅ Order Ready!
  
  Your order is packed and ready for delivery.
  Driver will be assigned shortly.`
);
```

### Step 16: Driver Assigned & Dispatched

```typescript
await prisma.order.update({
  where: { id: order.id },
  data: {
    status: 'OUT_FOR_DELIVERY',
    dispatchedAt: new Date()
  }
});

await whatsapp.sendText(user.phone,
  `🚚 Out for Delivery!
  
  Your order is on the way!
  Driver: ${driverName}
  Phone: ${driverPhone}
  
  Est. arrival: ${estimatedArrival}
  
  📱 Keep your order QR code ready!`
);
```

---

## 🎯 PHASE 7: Delivery & QR Verification

### Step 17: Driver Arrives

```typescript
await prisma.order.update({
  where: { id: order.id },
  data: {
    status: 'ARRIVED',
    arrivedAt: new Date()
  }
});

await whatsapp.sendText(user.phone,
  `🚗 Driver Has Arrived!
  
  Please:
  1. Show the driver your ORDER QR CODE
  2. Driver will scan it to confirm delivery
  3. Inspect your order
  4. Delivery will be complete once scanned
  
  Order #${order.orderNumber}`
);
```

### Step 18: Customer Shows QR Code to Driver

```
Customer → Shows QR code on their phone
Driver → Opens WhatsApp, scans QR code
```

### Step 19: Driver Scans QR Code

**Driver's Flow:**
```
Driver sends to platform WhatsApp:
"scan order"

Bot: "📸 Scan Order QR Code

Take a photo of the customer's order QR code to complete delivery."

[Driver sends photo of QR code]
```

**QR Verification:**
```typescript
async function handleDriverQRScan(driverPhone, qrCodeImage) {
  // Extract QR code from image
  const qrCode = await extractQRCode(qrCodeImage);
  
  if (!qrCode.startsWith('order:')) {
    await whatsapp.sendText(driverPhone, '❌ Invalid QR code');
    return;
  }
  
  const orderQRCode = qrCode.replace('order:', '');
  
  // Find order
  const order = await prisma.order.findUnique({
    where: { orderQRCode },
    include: { user: true, business: true }
  });
  
  if (!order) {
    await whatsapp.sendText(driverPhone, '❌ Order not found');
    return;
  }
  
  if (order.status !== 'ARRIVED') {
    await whatsapp.sendText(driverPhone, 
      `⚠️ Order status: ${order.status}. Cannot mark as delivered.`
    );
    return;
  }
  
  // GET DRIVER'S LOCATION
  await whatsapp.sendText(driverPhone, 
    '📍 Share your current location to confirm delivery.'
  );
  
  // Wait for location...
}

async function handleDriverLocation(driverPhone, location) {
  const order = await getCurrentDriverOrder(driverPhone);
  
  // Verify driver is near delivery location (within 100m)
  const distance = calculateDistance(
    location.latitude,
    location.longitude,
    order.deliveryLat,
    order.deliveryLng
  );
  
  if (distance > 0.1) { // More than 100 meters
    await whatsapp.sendText(driverPhone,
      `⚠️ You're ${(distance * 1000).toFixed(0)}m away from delivery location. Please get closer.`
    );
    return;
  }
  
  // COMPLETE DELIVERY
  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'DELIVERED',
      deliveredAt: new Date(),
      qrScannedAt: new Date(),
      qrScannedBy: driverPhone,
      qrScanLocation: {
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: new Date(),
        accuracy: location.accuracy
      }
    }
  });
  
  // Notify customer
  await whatsapp.sendText(order.user.phone,
    `✅ Delivery Complete!
    
    Order #${order.orderNumber}
    Delivered at: ${formatTime(new Date())}
    
    Thank you for your order!
    
    Rate your experience:
    [⭐⭐⭐⭐⭐]  [⭐⭐⭐⭐]  [⭐⭐⭐]`
  );
  
  // Notify driver
  await whatsapp.sendText(driverPhone,
    `✅ Delivery Confirmed!
    
    Order #${order.orderNumber} marked as delivered.
    
    Customer: ${order.user.name}
    Location verified: ${distance.toFixed(0)}m accuracy
    
    [Next Delivery]`
  );
  
  // Notify business
  await notifyBusinessOfDelivery(order);
}
```

---

## 💰 PHASE 8: Payout Processing (Every Friday)

### Step 20: Weekly Payout Calculation

```typescript
// Runs every Friday at 9 AM
async function processWeeklyPayouts() {
  const businesses = await prisma.business.findMany({
    where: {
      bankingVerified: true,
      status: 'ACTIVE'
    }
  });
  
  for (const business of businesses) {
    const periodStart = getLastFriday();
    const periodEnd = getThisFriday();
    
    // Get completed orders
    const orders = await prisma.order.findMany({
      where: {
        businessId: business.id,
        status: 'DELIVERED',
        paymentStatus: 'COMPLETED',
        payoutProcessed: false,
        deliveredAt: {
          gte: periodStart,
          lt: periodEnd
        }
      }
    });
    
    if (orders.length === 0) continue;
    
    const grossRevenue = orders.reduce((sum, o) => sum + o.grandTotal, 0);
    const platformFee = orders.reduce((sum, o) => sum + o.platformFee, 0);
    const refunds = 0; // Calculate refunds
    const netPayout = grossRevenue - platformFee - refunds;
    
    if (netPayout < business.minimumPayout) {
      // Carry over to next week
      continue;
    }
    
    // Create payout
    const payout = await prisma.payout.create({
      data: {
        businessId: business.id,
        periodStart,
        periodEnd,
        grossRevenue,
        platformFee,
        refunds,
        netPayout,
        orderCount: orders.length,
        orderIds: orders.map(o => o.id),
        status: 'PENDING',
        scheduledFor: getThisFriday(),
        bankName: business.bankName,
        accountNumber: business.accountNumber,
        accountHolder: business.accountHolder
      }
    });
    
    // Mark orders as processed
    await prisma.order.updateMany({
      where: {
        id: { in: orders.map(o => o.id) }
      },
      data: {
        payoutId: payout.id,
        payoutProcessed: true
      }
    });
    
    // Notify business owner
    await notifyPayoutScheduled(business, payout);
  }
}
```

### Step 21: Notify Business Owner

```typescript
await whatsapp.sendText(business.phone,
  `💰 Payout Scheduled
  
  Period: ${formatDate(payout.periodStart)} - ${formatDate(payout.periodEnd)}
  
  Orders: ${payout.orderCount}
  Gross Revenue: R${payout.grossRevenue}
  Platform Fee (${business.platformFeePercentage}%): -R${payout.platformFee}
  Refunds: -R${payout.refunds}
  
  Net Payout: R${payout.netPayout}
  
  Bank: ${payout.bankName}
  Account: ***${payout.accountNumber.slice(-4)}
  
  Payment Date: This Friday
  Reference: ${payout.id.slice(0, 8).toUpperCase()}
  
  You'll receive confirmation once payment is processed.`
);
```

### Step 22: Process Payment (Friday)

```typescript
async function executePayouts() {
  const payouts = await prisma.payout.findMany({
    where: {
      status: 'PENDING',
      scheduledFor: {
        lte: new Date()
      }
    }
  });
  
  for (const payout of payouts) {
    try {
      // Process bank transfer (integrate with bank API)
      const paymentRef = await processBankTransfer({
        accountNumber: payout.accountNumber,
        bankName: payout.bankName,
        amount: payout.netPayout,
        reference: `PAYOUT-${payout.id.slice(0, 8)}`
      });
      
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'COMPLETED',
          paymentReference: paymentRef,
          processedAt: new Date(),
          paidAt: new Date()
        }
      });
      
      // Update business balance
      await prisma.business.update({
        where: { id: payout.businessId },
        data: {
          pendingPayout: { decrement: payout.netPayout },
          totalPaidOut: { increment: payout.netPayout },
          lastPayoutAt: new Date()
        }
      });
      
      // Notify business
      await whatsapp.sendText(business.phone,
        `✅ Payment Sent!
        
        R${payout.netPayout} has been transferred to your account.
        
        Reference: ${paymentRef}
        Bank: ${payout.bankName}
        Account: ***${payout.accountNumber.slice(-4)}
        
        Please allow 24 hours for funds to reflect.`
      );
      
    } catch (error) {
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'FAILED',
          failureReason: error.message
        }
      });
      
      // Notify admin
      await notifyAdminPayoutFailed(payout, error);
    }
  }
}
```

---

## ⚖️ LEGAL LIABILITY FRAMEWORK

### Platform Terms (Displayed to All Users)

```
PLATFORM LIABILITY WAIVER

1. SERVICE PROVIDER ROLE
   We are a technology platform connecting customers with independent merchants.
   We DO NOT:
   - Own, operate, or control merchant businesses
   - Prepare, package, or deliver products
   - Make warranties about product quality or safety
   - Assume liability for merchant actions

2. MERCHANT RESPONSIBILITY
   Each merchant is an independent business operator solely responsible for:
   - Product quality, safety, and compliance
   - Food handling and hygiene standards
   - Accurate product descriptions
   - Timely preparation and delivery
   - Customer service and issue resolution

3. PLATFORM RESPONSIBILITY
   We ARE responsible for:
   - Secure payment processing
   - Data protection and privacy
   - Platform uptime and availability
   - Payment disbursement to merchants
   - Dispute mediation (not resolution)

4. CUSTOMER RESPONSIBILITIES
   - Verify merchant credentials before ordering
   - Report issues directly to merchant first
   - Provide accurate delivery information
   - Ensure payment accuracy

5. LIABILITY LIMITATIONS
   We are NOT liable for:
   - Foodborne illness or product defects
   - Delayed, damaged, or incorrect deliveries
   - Merchant business closures or suspensions
   - Product quality or safety issues
   - Direct, indirect, or consequential damages

6. DISPUTE RESOLUTION
   - Contact merchant first for issues
   - Platform mediation available if unresolved
   - South African law governs all disputes
   - Maximum liability: Transaction value only

7. ACCEPTANCE
   By using this platform, you acknowledge:
   - You've read and understood these terms
   - You accept all risks associated with merchant services
   - You release the platform from merchant-related claims
```

### Business Owner Terms

```
MERCHANT TERMS & LIABILITY

1. INDEPENDENT CONTRACTOR
   You operate as an independent business, not as our employee or agent.

2. YOUR RESPONSIBILITIES
   - Product quality, safety, and legal compliance
   - All licenses, permits, and certifications
   - Food handling and hygiene standards
   - Accurate product listings
   - Timely order fulfillment
   - Customer service and issue resolution
   - Tax compliance and reporting

3. LIABILITY ACKNOWLEDGMENT
   You accept FULL LIABILITY for:
   - Product defects or contamination
   - Foodborne illness or allergic reactions
   - Delivery damages or errors
   - Customer complaints and refunds
   - Legal compliance violations

4. INDEMNIFICATION
   You agree to indemnify and hold harmless the platform from:
   - Any claims arising from your products/services
   - Customer injuries or damages
   - Regulatory violations
   - Intellectual property infringement

5. PLATFORM FEE
   - ${platformFeePercentage}% per transaction
   - Deducted before payout
   - Covers: payment processing, technology, support

6. PAYOUT TERMS
   - Weekly payouts every Friday
   - Minimum payout: R${minimumPayout}
   - 2-3 business day bank transfer
   - Held for disputed orders

7. TERMINATION
   Platform may suspend/terminate for:
   - Safety or quality violations
   - Customer complaint patterns
   - Legal non-compliance
   - Terms violations

8. ACCEPTANCE
   ☐ I acknowledge full liability for my products/services
   ☐ I indemnify the platform from merchant-related claims
   ☐ I've read and accept these terms
   
   Signature: _________________
   Date: _________________
```

### Implementation

```typescript
// On business registration
async function completeBusinessRegistration(businessId) {
  const terms = await prisma.platformTerms.findFirst({
    where: { isActive: true },
    orderBy: { version: 'desc' }
  });
  
  await whatsapp.sendText(business.phone,
    `📋 Final Step: Terms & Conditions
    
    ${terms.merchantLiabilityClause}
    
    ⚠️ CRITICAL:
    - You are fully liable for product quality/safety
    - Platform is NOT responsible for your products
    - You must carry appropriate insurance
    
    Reply "I ACCEPT" to complete registration.`
  );
  
  // Wait for acceptance
  const response = await waitForResponse(business.phone);
  
  if (response.toLowerCase() === 'i accept') {
    await prisma.business.update({
      where: { id: businessId },
      data: {
        acceptedPlatformTerms: true,
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: terms.version,
        acknowledgedLiability: true,
        liabilityAcknowledgedAt: new Date()
      }
    });
    
    await whatsapp.sendText(business.phone,
      `✅ Registration Complete!
      
      Your business is now pending verification.
      We'll review and notify you within 24-48 hours.
      
      Next steps:
      1. Upload compliance documents
      2. Add products to your catalog
      3. Set up banking details
      4. Configure delivery zones
      
      [Continue Setup]`
    );
  }
}
```

---

## 📊 Summary

### Key Features Implemented:

1. ✅ **User KYC** - Contact details, ID verification
2. ✅ **Location Sharing** - GPS-based delivery validation
3. ✅ **Welcome Messages** - Custom per business
4. ✅ **Order QR Codes** - Generated on payment
5. ✅ **QR Verification** - Driver scans to complete delivery
6. ✅ **Banking Details** - For merchant payouts
7. ✅ **Weekly Payouts** - Every Friday
8. ✅ **Platform Fee** - Configurable % per business
9. ✅ **Legal Framework** - Full liability protection
10. ✅ **Dispute Resolution** - Clear process

### Security Measures:

- QR codes unique per order
- Location verification (driver within 100m)
- Timestamp all critical actions
- Bank details encrypted
- Terms acceptance tracked
- Payment reference numbers

### Liability Protection:

- Clear Terms & Conditions
- Merchant acknowledgment required
- Customer awareness enforced
- Platform role clearly defined
- Indemnification clauses
- South African law compliance
