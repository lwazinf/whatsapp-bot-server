# 🏗️ Multi-Business Platform Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        WhatsApp Users                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  360Dialog API  │
                    │   (Webhooks)    │
                    └───────┬────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼─────┐      ┌─────▼──────┐     ┌─────▼──────┐
   │ Business │      │  Business  │     │  Business  │
   │    A     │      │     B      │     │     C      │
   └────┬─────┘      └─────┬──────┘     └─────┬──────┘
        │                  │                   │
        └──────────────────┼───────────────────┘
                           │
                  ┌────────▼─────────┐
                  │  Express Server  │
                  │   (TypeScript)   │
                  └────────┬─────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼─────┐     ┌─────▼──────┐    ┌────▼─────┐
   │PostgreSQL│     │   Redis    │    │ Payment  │
   │ (Prisma) │     │  (Cache)   │    │ Gateways │
   └──────────┘     └────────────┘    └──────────┘
```

## Key Design Principles

### 1. Multi-Tenancy
- Each business is isolated
- Shared infrastructure, separated data
- Business-specific configurations

### 2. Stateless Sessions
- Redis for session management
- Cart data per business per user
- 30-minute session timeout

### 3. QR Code System
- Unique 12-character codes
- Collision-resistant nanoid generation
- Image generation with qrcode library

### 4. Scalable Architecture
- Horizontal scaling ready
- Database connection pooling
- Redis caching layer

## Data Relationships

```
User ──┬── FavoriteBusiness ──> Business
       └── Order ───> Business
                 └──> OrderItem ──> Product ──> Business
```

## Session Flow

```
1. User sends message
2. Session retrieved from Redis (session:{phone})
3. Business context loaded (session.businessId)
4. State machine processes message
5. Session updated in Redis (30min TTL)
```

## Business Access Methods

### QR Code Flow
```
1. Business generates QR code with nanoid
2. Customer scans QR with WhatsApp
3. Bot extracts identifier from image/caption
4. Business loaded via qrCode lookup
5. Menu displayed
```

### Search Flow
```
1. Customer types business name
2. Full-text search on name/category/description
3. Results ranked (verified first)
4. Customer selects from list
5. Business loaded via ID
```

### Favorites Flow
```
1. User favorites a business
2. Record created in favorite_businesses
3. "My Favorites" shows all saved businesses
4. One-tap access to menu
```

## Payment Architecture

```
Order → Business Payment Config
   ├── Ozow (if configured)
   │   ├── Site Code
   │   └── Private Key
   └── Yoco (if configured)
       └── Secret Key
           
Webhook → Verify Signature → Update Order → Notify Customer
```

## Future: Business Applications

```
Merchant → Apply
   ├── Fill form
   ├── Upload documents
   │   ├── Registration
   │   ├── Tax certificate
   │   └── ID document
   └── Submit
       
Platform → Review (5 business days)
   ├── Approve → Create Business
   └── Reject → Notify merchant
```

**Status:** Commented out in schema, ready to implement.

---

For implementation details, see source code comments.
