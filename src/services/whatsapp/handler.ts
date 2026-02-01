import { PrismaClient, Mode } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();
const ADMIN_NUMBER = "27746854339";

export const handleIncomingMessage = async (webhookData: any) => {
  const value = webhookData.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];

  if (!message) return;

  const from = message.from; 
  const textBody = message.text?.body?.trim();
  const input = message.interactive?.button_reply?.id || textBody;

  try {
    let session = await db.userSession.findUnique({ where: { wa_id: from } });
    if (!session) {
      session = await db.userSession.create({ data: { wa_id: from, mode: Mode.CUSTOMER } });
    }

    // 1. Secret Handshake Logic
    if (input === 'SwitchOmeru') {
      const merchant = await db.merchant.findUnique({ where: { wa_id: from } });
      
      // If they aren't in your Merchant table at all, the command does nothing (Hidden)
      if (!merchant) return; 

      // If they are an approved merchant but have no store name yet, start registration
      if (!merchant.trading_name || merchant.trading_name === "") {
        await db.userSession.update({ 
          where: { wa_id: from }, 
          data: { mode: Mode.REGISTERING } 
        });
        return sendTextMessage(from, "👋 Approved! Let's set up your shop. What is your *Business Name*?");
      }

      // If they are already set up, just toggle modes
      const newMode = session.mode === Mode.CUSTOMER ? Mode.MERCHANT : Mode.CUSTOMER;
      await db.userSession.update({ where: { wa_id: from }, data: { mode: newMode } });
      return sendTextMessage(from, `✅ Mode: *${newMode}*`);
    }

    // 2. State Machine Routing
    if (session.mode === Mode.REGISTERING) {
      return handleRegistration(from, input);
    }

    if (session.mode === Mode.MERCHANT) {
      return handleMerchantMenu(from, input, message.location);
    }

    // Default Customer logic
    if (input?.toLowerCase() === 'hi') {
      return sendTextMessage(from, "Welcome to Omeru! 🛍️");
    }

  } catch (error) {
    console.error("❌ Logic Error:", error);
  }
};

async function handleRegistration(from: string, input: string) {
  // Update the blank merchant record with the name they just sent
  await db.merchant.update({
    where: { wa_id: from },
    data: { trading_name: input, is_verified: true }
  });

  await db.userSession.update({ 
    where: { wa_id: from }, 
    data: { mode: Mode.MERCHANT } 
  });

  await sendTextMessage(ADMIN_NUMBER, `🏪 New Store Setup: *${input}* (${from})`);
  return sendTextMessage(from, `✅ Store *${input}* is now live! You are in Merchant Mode.`);
}

async function handleMerchantMenu(from: string, input: string, location?: any) {
    const merchant = await db.merchant.findUnique({ where: { wa_id: from } });
    
    if (location) {
        await db.merchant.update({
            where: { wa_id: from },
            data: { latitude: location.latitude, longitude: location.longitude }
        });
        return sendTextMessage(from, "📍 Location updated!");
    }

    if (input === 'm_orders') {
        return sendTextMessage(from, "📦 No active orders.");
    }

    return sendButtons(from, `🏪 Dashboard: ${merchant?.trading_name}`, [
        { id: 'm_orders', title: '📦 View Orders' },
        { id: 'm_location', title: '📍 Set Location' }
    ]);
}