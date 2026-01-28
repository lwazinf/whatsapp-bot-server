# ⚡ Multi-Business Platform - Quick Start

## 🎯 Get Running in 10 Minutes

### Step 1: Install (2 min)
```bash
cd multi-business-whatsapp-bot
npm install
```

### Step 2: Configure (2 min)
```bash
cp .env.example .env
# Edit .env - minimum required:
# - DATABASE_URL
# - REDIS_URL  
# - WHATSAPP_API_KEY
```

### Step 3: Database (3 min)
```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

**Output shows QR codes:**
```
✅ Premium Meat Delivery: A1B2C3D4E5F6
✅ Joe's Butchery: B2C3D4E5F6G7
✅ Fresh Cuts & More: C3D4E5F6G7H8
```

### Step 4: Start (1 min)
```bash
npm run dev
```

### Step 5: Test (2 min)
Send to WhatsApp:
```
qr:A1B2C3D4E5F6
```

Bot replies with Premium Meat Delivery menu! 🎉

## 📸 Testing QR Codes

### Option 1: Direct Message
```
qr:QR_CODE_HERE
```

### Option 2: Search
```
Premium Meat
```

### Option 3: Favorites
```
Type: start
Click: "My Favorites"
```

## 🏪 Adding Your Business

```bash
npm run prisma:studio
```

1. Open Prisma Studio (localhost:5555)
2. Go to "Business" table
3. Click "Add record"
4. Fill in:
   - name: "Your Business Name"
   - category: "meat" (or custom)
   - phone: "27xxxxxxxxx"
   - qrCode: Generate 12-char code
   - isActive: true
5. Save

Your QR code: Copy from qrCode field

## 🧪 Test Flow

1. **Scan QR** → `qr:CODE`
2. **Browse Menu** → Click "Browse Menu"
3. **Add to Cart** → Select category → Select product
4. **Checkout** → "View Cart" → "Checkout"
5. **Payment** → Choose Ozow/Yoco → Complete

## 🔧 Common Issues

**"Cannot connect to database"**
```bash
# Check PostgreSQL is running
psql $DATABASE_URL
```

**"Redis connection failed"**
```bash
# Check Redis is running
redis-cli ping
```

**"WhatsApp not responding"**
1. Check webhook URL in 360Dialog
2. Use ngrok for local testing
3. Verify API key

## 📚 Next Steps

- Read README.md for full documentation
- See ARCHITECTURE.md for technical details
- Check out example businesses in seed data
- Configure payment gateways per business

**Time to first order: 10 minutes!** ⚡
