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
  const buttonId = message.interactive?.button_reply?.id;
  const location = message.location;
  const input = buttonId || textBody;

  try {
    let session = await db.userSession.findUnique({ where: { wa_id: from } });
    if (!session) {
      session = await db.userSession.create({ data: { wa_id: from, mode: Mode.CUSTOMER } });
    }

    const merchant = await db.merchant.findUnique({ where: { wa_id: from } });

    // 1. Silent Secret Handshake
    if (input === 'SwitchOmeru') {
      if (!merchant) return; // Ignore completely if not a merchant

      // If they are authorized but have no store yet -> Start Registration
      if (!merchant.trading_name) {
        await db.userSession.update({ 
          where: { wa_id: from }, 
          data: { mode: Mode.REGISTERING } 
        });
        return sendTextMessage(from, "👋 Authorization confirmed. Please reply with your *Business Name* to set up your shop:");
      }

      // If already setup -> Toggle and show relevant Dashboard
      const newMode = session.mode === Mode.CUSTOMER ? Mode.MERCHANT : Mode.CUSTOMER;
      await db.userSession.update({ where: { wa_id: from }, data: { mode: newMode } });
      
      if (newMode === Mode.MERCHANT) {
          return sendMerchantDashboard(from, merchant);
      } else {
          return sendTextMessage(from, "✅ Mode switched to: *CUSTOMER*");
      }
    }

    // 2. Registration Logic
    if (session.mode === Mode.REGISTERING) {
      await db.merchant.update({
        where: { wa_id: from },
        data: { trading_name: input, is_verified: true }
      });
      await db.userSession.update({ where: { wa_id: from }, data: { mode: Mode.MERCHANT } });
      await sendTextMessage(ADMIN_NUMBER, `🆕 *New Store Live:* ${input} (${from})`);
      
      const updatedMerchant = await db.merchant.findUnique({ where: { wa_id: from } });
      return sendMerchantDashboard(from, updatedMerchant!);
    }

    // 3. Merchant Dashboard Actions
    if (session.mode === Mode.MERCHANT && merchant) {
      if (location) {
        await db.merchant.update({
          where: { wa_id: from },
          data: { latitude: location.latitude, longitude: location.longitude }
        });
        await sendTextMessage(from, "📍 *Location updated successfully!*");
        return sendMerchantDashboard(from, merchant); // Return to menu
      }

      if (input === 'm_orders') {
        const orders = await db.order.findMany({ where: { merchant_id: merchant.id }, take: 3 });
        const list = orders.length ? orders.map(o => `🔸 #${o.id.slice(-4)} - R${o.total}`).join('\n') : "No active orders.";
        await sendTextMessage(from, `📈 *Recent Orders:*\n\n${list}`);
        return sendMerchantDashboard(from, merchant); // Return to menu
      }

      if (input === 'm_location') {
        return sendTextMessage(from, "📍 Please send your shop location pin using the WhatsApp paperclip.");
      }
      
      // If they send random text in merchant mode, just re-show dashboard
      return sendMerchantDashboard(from, merchant);
    }

    // 4. Default Customer logic
    if (input?.toLowerCase() === 'hi') {
      return sendTextMessage(from, "Welcome to Omeru! 🛍️");
    }

  } catch (error) {
    console.error("❌ Logic Error:", error);
  }
};

async function sendMerchantDashboard(to: string, merchant: any) {
  return sendButtons(to, `🏪 *${merchant.trading_name}* Dashboard`, [
    { id: 'm_orders', title: '📦 View Orders' },
    { id: 'm_location', title: '📍 Update Location' }
  ]);
}