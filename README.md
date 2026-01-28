# 🏪 Multi-Business WhatsApp Ordering Platform

A complete WhatsApp-based ordering platform that supports multiple businesses with QR code scanning, search functionality, and user favorites.

## 🎯 Key Features

### For Customers
- ✅ **QR Code Scanning** - Take a photo of business QR codes to access instantly
- ✅ **Business Search** - Find businesses by name or category
- ✅ **Favorites** - Save favorite businesses for quick access
- ✅ **Multi-Business Support** - Order from different vendors in one platform
- ✅ **Shopping Cart** - Manage items per business
- ✅ **Dual Payments** - Ozow (EFT) + Yoco (Cards)
- ✅ **Order Tracking** - Real-time status updates

### For Business Owners
- ✅ **Unique QR Codes** - Each business gets a scannable QR code
- ✅ **Independent Menus** - Manage your own product catalog
- ✅ **Custom Settings** - Set delivery fees, minimum orders, etc.
- ✅ **Payment Integration** - Configure your own payment gateways
- ✅ **Operating Hours** - Control when you're open for orders
- ✅ **Analytics** - Track orders, revenue, and favorites

### Platform Features
- ✅ **Multi-Tenant Architecture** - Isolated business data
- ✅ **Session Management** - Redis-based fast caching
- ✅ **TypeScript** - Type-safe codebase
- ✅ **PostgreSQL + Prisma** - Robust database layer
- ✅ **Admin Dashboard API** - Manage businesses and orders

## 📱 User Flow

```
Customer Opens WhatsApp
        ↓
    Welcome Message
        ↓
   Choose Access Method:
   ┌──────────┬──────────┬──────────┐
   │ Scan QR  │  Search  │Favorites │
   └────┬─────┴────┬─────┴────┬─────┘
        │          │          │
        ↓          ↓          ↓
   📸 Camera  🔍 Search  ⭐ List
        │          │          │
        └──────────┴──────────┘
                   ↓
          Select Business
                   ↓
            Browse Menu
                   ↓
           Add to Cart
                   ↓
             Checkout
                   ↓
        Choose Payment (Ozow/Yoco)
                   ↓
          Complete Payment
                   ↓
         Order Confirmed! 🎉
```

## 🗄️ Database Schema

### Core Tables
- **users** - Customer accounts
- **businesses** - Vendor/merchant stores
- **favorite_businesses** - User's saved businesses
- **products** - Items per business
- **orders** - Order transactions
- **order_items** - Line items
- **operating_hours** - Business schedules
- **sessions** - User state management

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Database Setup
```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

This creates 3 sample businesses:
- **Premium Meat Delivery** (QR: displayed in seed output)
- **Joe's Butchery** (QR: displayed in seed output)
- **Fresh Cuts & More** (QR: displayed in seed output)

### 4. Start Server
```bash
npm run dev
```

### 5. Test QR Code Access
Send this to your WhatsApp bot:
```
qr:QR_CODE_HERE
```
(Replace with actual QR code from seed output)

## 📸 QR Code System

### How It Works
1. Each business gets a unique QR code identifier (e.g., `A1B2C3D4E5F6`)
2. QR code contains: `qr:{identifier}`
3. Customer scans QR code with WhatsApp camera
4. Bot receives image, extracts identifier
5. Business menu loads automatically

### Testing QR Codes
```bash
# After seeding, you'll see QR codes like:
# Premium Meat Delivery: A1B2C3D4E5F6
# Joe's Butchery: B2C3D4E5F6G7
# Fresh Cuts & More: C3D4E5F6G7H8

# To test, send as WhatsApp message:
qr:A1B2C3D4E5F6
```

### Generate QR Code Images
The system auto-generates QR code images that businesses can print:
```typescript
// QR code stored in business.qrCodeImage as data URL
// In production, upload to S3/CDN
```

## 🔍 Search Functionality

### Search Examples
User sends: `"Premium Meats"`
- Searches: Business name, category, description
- Returns: Ranked results (verified first)
- Limit: 20 results

### Search Algorithm
1. Case-insensitive matching
2. Prioritizes verified businesses
3. Alphabetical sorting within results

## ⭐ Favorites System

### How It Works
```sql
-- User saves business
INSERT INTO favorite_businesses (user_id, business_id);

-- Quick access
SELECT * FROM businesses 
WHERE id IN (SELECT business_id FROM favorite_businesses WHERE user_id = ?);
```

### UI Flow
```
User browses business → "Add to Favorites" button
    ↓
Saved to database
    ↓
"My Favorites" shows saved businesses
    ↓
One-tap access to their menu
```

## 💼 Business Management

### Adding a Business
```typescript
import businessService from './services/business/business.service';

const business = await businessService.createBusiness({
  name: 'New Butchery',
  category: 'meat',
  phone: '27123456789',
  email: 'info@newbutchery.co.za',
  minOrderAmount: 50,
  deliveryFee: 30,
  freeDeliveryThreshold: 500,
});

// Outputs:
// ✅ Business created with QR: X1Y2Z3A4B5C6
```

### Business Settings
Each business configures:
- `minOrderAmount` - Minimum order value
- `deliveryFee` - Standard delivery charge
- `freeDeliveryThreshold` - Free delivery above this amount
- `ozowSiteCode`, `ozowPrivateKey` - Ozow credentials
- `yocoSecretKey` - Yoco credentials

### Operating Hours
```typescript
// Monday-Friday: 9AM-6PM
// Saturday: 9AM-3PM
// Sunday: Closed
```

## 🛒 Cart System (Per Business)

Cart is isolated per business:
```
User's Active Carts:
├── Premium Meat Delivery
│   ├── Beef Ribeye × 2kg
│   └── Chicken Breasts × 1kg
└── Joe's Butchery
    ├── T-Bone Steak × 3kg
    └── Boerewors × 2kg
```

When user switches business, cart is saved and restored.

## 💳 Payment Flow

### Per-Business Payment Configuration
```javascript
// Each business has own payment credentials
Order → Business Payment Gateway → Webhook → Confirm

// Example:
Premium Meat uses Ozow (their credentials)
Joe's Butchery uses Yoco (their credentials)
```

### Payment Distribution
- Platform fee: Configurable %
- Business receives: Order total - platform fee
- Settlement: Per business payment account

## 🎨 Customization Per Business

### Branding
```typescript
business: {
  name: 'Your Business',
  logo: 'https://cdn.example.com/logo.png',
  coverImage: 'https://cdn.example.com/cover.jpg',
  description: 'Your tagline here',
}
```

### Categories
```typescript
// Custom categories per business
['beef', 'chicken', 'pork', 'seafood', 'specials']
```

## 📊 Admin Dashboard APIs

### Business Management
```
GET    /api/admin/businesses          - List all businesses
GET    /api/admin/businesses/:id      - Business details
POST   /api/admin/businesses          - Create business
PATCH  /api/admin/businesses/:id      - Update business
DELETE /api/admin/businesses/:id      - Delete business
PATCH  /api/admin/businesses/:id/verify - Verify business
```

### Order Management
```
GET    /api/admin/orders?businessId=xxx - Orders per business
GET    /api/admin/orders/:id            - Order details
PATCH  /api/admin/orders/:id/status     - Update status
```

### Analytics
```
GET /api/admin/businesses/:id/stats
Response:
{
  totalOrders: 1234,
  totalRevenue: 456789.50,
  productCount: 45,
  favoriteCount: 89
}
```

## 🔒 Security

- ✅ **Business Isolation** - Data separation
- ✅ **QR Code Uniqueness** - Collision-resistant IDs
- ✅ **Payment Verification** - Webhook signatures
- ✅ **Session Expiry** - 30-minute timeout
- ✅ **Input Validation** - Joi schemas
- ✅ **SQL Injection Protection** - Prisma ORM

## 📈 Scalability

### Database Indexes
```sql
-- Optimized queries
CREATE INDEX idx_business_qr ON businesses(qr_code);
CREATE INDEX idx_products_business ON products(business_id);
CREATE INDEX idx_orders_business ON orders(business_id);
CREATE INDEX idx_favorites_user ON favorite_businesses(user_id);
```

### Caching Strategy
```
Redis:
├── Session Data (30 min)
├── Cart Data (24 hours)
├── Business Cache (1 hour)
└── Product Catalog (30 min)
```

## 🚀 Deployment

### Railway (Recommended)
```bash
railway init
railway add --plugin postgresql
railway add --plugin redis
railway up
```

### Environment Variables
```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
WHATSAPP_API_KEY=...
```

## 💰 Cost Optimization

At 500 orders/day across 10 businesses:

| Component | Monthly Cost |
|-----------|-------------|
| Payment Fees (mixed) | ~R90,000 |
| WhatsApp API | R3,500 |
| Infrastructure | R800 |
| **TOTAL** | **~R94,300** |

**Revenue sharing model:**
- Platform fee: 3-5% per order
- Business keeps: 95-97%
- Sustainable at scale

## 🔮 Future Features (Commented Out)

### Business Application System
```typescript
// COMMENTED OUT IN schema.prisma
// Uncomment when ready to implement

model BusinessApplication {
  // Application workflow
  // Merchants apply → Platform reviews → Approve/Reject
  // Implementation time: ~2 weeks
}
```

To enable:
1. Uncomment in `prisma/schema.prisma`
2. Run `npm run prisma:migrate`
3. Build application form handler
4. Create admin review interface

## 📞 Support

### For Customers
- WhatsApp: Contact individual business
- Platform: [email protected]

### For Business Owners
- Onboarding: [email protected]
- Technical: [email protected]
- Payments: [email protected]

## 🎯 Quick Commands

```bash
# Development
npm run dev

# Database
npm run prisma:studio    # Visual database editor
npm run prisma:migrate   # Run migrations
npm run prisma:seed      # Seed sample data

# Production
npm run build
npm start
```

## 📄 Documentation

- **README.md** (this file) - Overview and setup
- **ARCHITECTURE.md** - Technical architecture
- **API.md** - API documentation
- **BUSINESS_GUIDE.md** - Guide for business owners

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Test with multiple businesses
4. Submit pull request

## 📄 License

MIT License - Commercial use allowed

---

**Built for scale. Ready for business. 🏪**

Start with `npm install` and you'll have a working multi-business platform in 10 minutes!
