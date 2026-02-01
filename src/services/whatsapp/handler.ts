import { PrismaClient } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();

export const handleIncomingMessage = async (webhookData: any) => {
  console.log("📩 Webhook Received Raw:", JSON.stringify(webhookData, null, 2));

  // 1. Correct extraction for Meta/360Dialog Cloud API structure
  const value = webhookData.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];

  if (!message) {
    console.log("ℹ️ Webhook received, but no message object found (might be a status update).");
    return;
  }

  const from = message.from; 
  if (!from) {
    console.error("❌ No 'from' field found in message.");
    return;
  }

  // Extract content
  const textBody = message.text?.body?.trim();
  const buttonId = message.interactive?.button_reply?.id;
  const location = message.location;
  const input = buttonId || textBody;

  console.log(`from: ${from}, input: ${input}`);

  try {
    // 2. Session management
    let session = await db.userSession.findUnique({ where: { wa_id: from } });
    if (!session) {
      console.log(`🆕 Creating new session for ${from}`);
      session = await db.userSession.create({ 
        data: { wa_id: from, mode: 'CUSTOMER' } 
      });
    }

    // 3. Global Toggle Command
    if (input === 'SwitchOmeru') {
      const merchant = await db.merchant.findUnique({ where: { wa_id: from } });
      if (!merchant || !merchant.is_verified) {
        return sendTextMessage(from, "🚫 Access Denied. You are not a verified Merchant.");
      }
      
      const newMode = session.mode === 'CUSTOMER' ? 'MERCHANT' : 'CUSTOMER';
      await db.userSession.update({
        where: { wa_id: from },
        data: { mode: newMode }
      });
      
      return sendTextMessage(from, `Mode switched to: *${newMode}*`);
    }

    // 4. Routing based on Mode
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
      // Default Customer response
      if (input?.toLowerCase() === 'hi' || input?.toLowerCase() === 'hello') {
        return sendTextMessage(from, "Welcome to Omeru! 🛍️\n\nIf you are a merchant, type *SwitchOmeru* to access your dashboard.");
      }
      return sendTextMessage(from, "I didn't quite get that. Type 'hi' to start.");
    }
  } catch (error) {
    console.error("❌ Error in handler logic:", error);
  }
};

async function handleMerchantMenu(from: string, input: string) {
  const merchant = await db.merchant.findUnique({ where: { wa_id: from } });

  if (input === 'm_orders') {
    const orders = await db.order.findMany({
      where: { merchant_id: merchant?.id },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });
    
    if (orders.length === 0) return sendTextMessage(from, "You have no active orders.");
    
    const list = orders.map(o => `🔸 *#${o.id.slice(-4)}* - R${o.total}`).join('\n');
    return sendTextMessage(from, `📈 *Recent Orders:*\n\n${list}`);
  }

  if (input === 'm_location') {
    return sendTextMessage(from, "📍 Please send your shop location pin using the WhatsApp paperclip.");
  }

  // Default: Show Dashboard Buttons
  return sendButtons(from, `🏪 *${merchant?.trading_name}* Dashboard`, [
    { id: 'm_orders', title: '📦 View Orders' },
    { id: 'm_location', title: '📍 Set Location' }
  ]);
}