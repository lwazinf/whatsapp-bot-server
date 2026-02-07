# 🚀 WhatsApp Multi-Business Bot

WhatsApp-only platform for multi-business ordering with QR verification and weekly payouts.

## ✨ Features

- 📱 100% WhatsApp interface (no web UI)
- 🏪 Multi-business support
- 📸 QR code verification for deliveries
- 💰 Weekly automated payouts
- 🖼️ Image storage with compression
- 💳 Payment processing (Ozow + Cash)

## 🛠️ Tech Stack

- **Server:** Node.js + Express + TypeScript
- **Database:** PostgreSQL (Neon)
- **Cache:** Redis (Upstash)
- **Images:** Cloudflare R2
- **WhatsApp:** 360Dialog API

## 🚀 Quick Deploy to Railway

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-bot-server.git
git push -u origin main
```

### 2. Deploy on Railway

1. Go to https://railway.app/
2. Login with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select this repository
5. Railway will auto-deploy!

### 3. Add Environment Variables

In Railway dashboard:
- Click "Variables" tab
- Click "Raw Editor"
- Paste your .env values
- Save

### 4. Get Your Server URL

- Settings → Generate Domain
- Copy: `https://your-app.up.railway.app`

### 5. Configure WhatsApp Webhook

In 360Dialog dashboard:
- Webhooks → Add webhook URL
- URL: `https://your-app.up.railway.app/api/whatsapp/webhook`
- Save

## 📝 Environment Variables

See `.env.example` for all required variables.

**Critical variables:**
- `DATABASE_URL` - Neon PostgreSQL connection
- `WHATSAPP_API_KEY` - 360Dialog API key
- `R2_ACCESS_KEY_ID` - Cloudflare R2 credentials
- `PLATFORM_ADMIN_NUMBERS` - Comma-separated admin WhatsApp numbers for owner invites

## 🧪 Testing

Send a WhatsApp message to your platform number to test!

## 📚 Documentation

- Full setup guide: See `DEPLOYMENT_GUIDE.md`
- Component details: See `COMPONENTS_AND_PRICING.md`

## 💰 Pricing Model

5% transaction fee (tiered: 5% → 4% → 3%)

## 🆘 Support

Issues? Check Railway logs:
- Railway Dashboard → Deployments → View Logs

## 📄 License

MIT

## 👤 Owner Invites

Only admins can add store owners. Use WhatsApp commands from an admin number:

1. Send `admin` to open the admin menu.
2. Choose **Add Owner** and send `+27XXXXXXXXX, Store Name`.
3. The owner receives an invite and can reply `sell` to start onboarding.
