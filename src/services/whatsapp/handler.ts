import { PrismaClient } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();

export const handleIncomingMessage = async (body: any) => {
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];

  if (!message) return;

  const from = message.from;
  const type = message.type;
  
  // Extracting different message types
  const location = message.location; 
  let incomingText = '';

  if (type === 'text') {
    incomingText = message.text?.body || '';
  } else if (type === 'interactive') {
    incomingText = message.interactive?.reply?.id || '';
  }

  try {
    // 1. Session Management
    let session = await db.userSession.upsert({
      where: { wa_id: from },
      update: { last_active: new Date() },
      create: { wa_id: from, mode: 'CUSTOMER' }
    });

    // 2. Handle Merchant Location Update
    if (location && session.mode === 'MERCHANT') {
      await db.merchant.update({
        where: { wa_id: from },
        data: {
          latitude: location.latitude,
          longitude: location.longitude,
        }
      });
      return sendTextMessage(from, "📍 *Location Updated!* Your shop is now pinned. Customers will see you in local searches.");
    }

    // 3. The SwitchOmeru Toggle
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

    // 4. Routing
    if (session.mode === 'MERCHANT') {
      return handleMerchantLogic(from, incomingText);
    } else {
      return handleCustomerLogic(from, incomingText);
    }

  } catch (err) {
    console.error("Critical Handler Error:", err);
    return sendTextMessage(from, "⚠️ System error. Please try again later.");
  }
};

async function handleMerchantLogic(from: string, input: string) {
  if (input === 'm_orders') {
    return sendTextMessage(from, "Checking your active orders... 📈");
  }
  if (input === 'm_location') {
    return sendTextMessage(from, "📍 Please share your *Location* (Pin) using the WhatsApp attachment icon.");
  }
  
  return sendButtons(from, "Merchant Dashboard:", [
    { id: 'm_orders', title: '📦 View Orders' },
    { id: 'm_location', title: '📍 Set Location' }
  ]);
}

async function handleCustomerLogic(from: string, input: string) {
  if (['hi', 'hello'].includes(input.toLowerCase())) {
    return sendTextMessage(from, "Welcome to Omeru! 🛍️ Search for a shop handle to start.");
  }
  return sendTextMessage(from, "Type 'Hi' to see options.");
}