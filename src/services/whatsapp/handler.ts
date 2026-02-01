// services/whatsapp/handler.ts
import { PrismaClient } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

// Reuse a single Prisma instance to prevent connection leaks
const db = new PrismaClient();

export const handleIncomingMessage = async (body: any) => {
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];

  if (!message) return;

  const from = message.from;
  const type = message.type;

  let incomingText = '';
  if (type === 'text') {
    incomingText = message.text?.body || '';
  } else if (type === 'interactive') {
    incomingText = message.interactive?.reply?.id || '';
  }

  try {
    // 1. Session Sync
    let session = await db.userSession.upsert({
      where: { wa_id: from },
      update: { last_active: new Date() },
      create: { wa_id: from, mode: 'CUSTOMER' }
    });

    // 2. Mode Switching Logic
    if (incomingText.trim() === 'SwitchOmeru') {
      const merchant = await db.merchant.findUnique({ where: { wa_id: from } });

      if (!merchant || !merchant.is_verified) {
        return sendTextMessage(from, "❌ Access Denied. Your number is not registered as a verified merchant.");
      }

      const newMode = session.mode === 'MERCHANT' ? 'CUSTOMER' : 'MERCHANT';
      await db.userSession.update({ where: { wa_id: from }, data: { mode: newMode } });

      if (newMode === 'MERCHANT') {
        return sendButtons(from, `🔓 *Merchant Mode Active*\nWelcome back, ${merchant.trading_name}!`, [
          { id: 'm_orders', title: '📦 View Orders' },
          { id: 'm_location', title: '📍 Set Location' },
          { id: 'm_status', title: '⚙️ My Status' }
        ]);
      } else {
        return sendTextMessage(from, "🔄 Switched to *Customer Mode*.");
      }
    }

    // 3. Routing
    if (session.mode === 'MERCHANT') {
      return await handleMerchantLogic(from, incomingText);
    } else {
      return await handleCustomerLogic(from, incomingText);
    }

  } catch (err) {
    console.error("Critical Handler Error:", err);
    // Notify user of system error so they aren't left hanging
    return sendTextMessage(from, "⚠️ I'm having trouble connecting to my database. Please try again in a moment.");
  }
};

async function handleMerchantLogic(from: string, input: string) {
  switch (input) {
    case 'm_orders':
      return sendTextMessage(from, "Checking your active orders... 📈");
    case 'm_location':
      return sendTextMessage(from, "📍 Please share your *Live Location* or a *Pin* using the 📎 attachment icon.");
    case 'm_status':
      return sendTextMessage(from, "✅ Your shop is currently *Online* and visible to customers.");
    default:
      return sendButtons(from, "Merchant Dashboard:", [
        { id: 'm_orders', title: '📦 View Orders' },
        { id: 'm_location', title: '📍 Set Location' }
      ]);
  }
}

async function handleCustomerLogic(from: string, input: string) {
  if (['hi', 'hello', 'start'].includes(input.toLowerCase())) {
    return sendTextMessage(from, "Welcome to Omeru! 🛍️ Search for a shop handle (e.g., @TheBakery) to start.");
  }
  return sendTextMessage(from, "I'm not sure what that means. Type 'Hi' to see options.");
}