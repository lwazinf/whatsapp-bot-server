import { PrismaClient } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();

export const handleIncomingMessage = async (webhookData: any) => {
  const value = webhookData.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];

  if (!message) return;

  const from = message.from; 
  const textBody = message.text?.body?.trim();
  const buttonId = message.interactive?.button_reply?.id;
  const location = message.location;
  const input = buttonId || textBody;

  try {
    // 1. Get or Create Session
    let session = await db.userSession.findUnique({ where: { wa_id: from } });
    if (!session) {
      session = await db.userSession.create({ data: { wa_id: from, mode: 'CUSTOMER' } });
    }

    // 2. Handle Registration Flow First
    if (session.mode === 'REGISTERING') {
      return handleRegistration(from, input, session);
    }

    // 3. Global Commands
    if (input === 'SwitchOmeru') {
      const merchant = await db.merchant.findUnique({ where: { wa_id: from } });
      
      if (!merchant) {
        // Start Registration if they don't exist
        await db.userSession.update({ where: { wa_id: from }, data: { mode: 'REGISTERING' } });
        return sendTextMessage(from, "👋 It looks like you aren't registered yet!\n\nWhat is the *Name of your Business*?");
      }

      if (!merchant.is_verified) {
        return sendTextMessage(from, "⏳ Your account is pending verification. We will notify you once it's active.");
      }
      
      const newMode = session.mode === 'CUSTOMER' ? 'MERCHANT' : 'CUSTOMER';
      await db.userSession.update({ where: { wa_id: from }, data: { mode: newMode } });
      return sendTextMessage(from, `✅ Mode switched to: *${newMode}*`);
    }

    // 4. Regular Mode Routing
    if (session.mode === 'MERCHANT') {
      if (location) {
        await db.merchant.update({
          where: { wa_id: from },
          data: { latitude: location.latitude, longitude: location.longitude }
        });
        return sendTextMessage(from, "✅ *Shop location updated!*");
      }
      return handleMerchantMenu(from, input);
    } else {
      // CUSTOMER MODE
      if (input?.toLowerCase() === 'hi' || input?.toLowerCase() === 'hello') {
        return sendTextMessage(from, "Welcome to Omeru! 🛍️\n\nType *SwitchOmeru* to manage your shop or register as a merchant.");
      }
      return sendTextMessage(from, "Type 'hi' to see the main menu.");
    }
  } catch (error) {
    console.error("❌ Logic Error:", error);
  }
};

async function handleRegistration(from: string, input: string, session: any) {
  // Simple step-based registration using the merchant record as state
  let merchant = await db.merchant.findUnique({ where: { wa_id: from } });

  if (!merchant) {
    // Save business name and ask for verification info (e.g. City)
    await db.merchant.create({
      data: {
        wa_id: from,
        trading_name: input,
        is_verified: false // Admin must verify later
      }
    });
    return sendTextMessage(from, `Great! *${input}* has been recorded. \n\nIn which city is your shop located?`);
  } else {
    // They provided the city, now complete registration
    await db.userSession.update({ where: { wa_id: from }, data: { mode: 'CUSTOMER' } });
    return sendTextMessage(from, "✅ Registration submitted! Our team will verify your shop shortly. Type 'hi' to continue as a customer.");
  }
}

async function handleMerchantMenu(from: string, input: string) {
  const merchant = await db.merchant.findUnique({ where: { wa_id: from } });

  if (input === 'm_orders') {
    const orders = await db.order.findMany({
      where: { merchant_id: merchant?.id },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });
    const list = orders.length ? orders.map(o => `🔸 *#${o.id.slice(-4)}* - R${o.total}`).join('\n') : "📦 No active orders.";
    return sendTextMessage(from, `📈 *Recent Orders:*\n\n${list}`);
  }

  if (input === 'm_location') {
    return sendTextMessage(from, "📍 Please send your shop location pin using the WhatsApp paperclip.");
  }

  return sendButtons(from, `🏪 *${merchant?.trading_name}* Dashboard`, [
    { id: 'm_orders', title: '📦 View Orders' },
    { id: 'm_location', title: '📍 Set Location' }
  ]);
}