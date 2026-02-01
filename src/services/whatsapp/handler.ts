import { PrismaClient } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();

export const handleIncomingMessage = async (webhookData: any) => {
  // LOGGING: This will help you see the data in Railway logs
  console.log("📩 Webhook Received:", JSON.stringify(webhookData, null, 2));

  const message = webhookData.messages?.[0];
  if (!message) return;

  const from = message.from; 
  if (!from) return;

  const textBody = message.text?.body?.trim();
  const buttonId = message.interactive?.button_reply?.id;
  const location = message.location;
  const input = buttonId || textBody;

  try {
    // 1. Session check
    let session = await db.userSession.findUnique({ where: { wa_id: from } });
    if (!session) {
      session = await db.userSession.create({ data: { wa_id: from, mode: 'CUSTOMER' } });
    }

    // 2. Global Toggle
    if (input === 'SwitchOmeru') {
      const merchant = await db.merchant.findUnique({ where: { wa_id: from } });
      if (!merchant || !merchant.is_verified) {
        return sendTextMessage(from, "🚫 Access Denied.");
      }
      
      const newMode = session.mode === 'CUSTOMER' ? 'MERCHANT' : 'CUSTOMER';
      await db.userSession.update({
        where: { wa_id: from },
        data: { mode: newMode }
      });
      
      return sendTextMessage(from, `Mode: *${newMode}*`);
    }

    // 3. Routing
    if (session.mode === 'MERCHANT') {
      if (location) {
        await db.merchant.update({
          where: { wa_id: from },
          data: { latitude: location.latitude, longitude: location.longitude }
        });
        return sendTextMessage(from, "✅ Location Saved!");
      }
      return handleMerchantMenu(from, input);
    } else {
      return sendTextMessage(from, "Customer Mode: Type 'SwitchOmeru' to switch.");
    }
  } catch (error) {
    console.error("❌ Database/Logic Error:", error);
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
    const list = orders.length ? orders.map(o => `🔸 #${o.id.slice(-4)} - R${o.total}`).join('\n') : "No orders.";
    return sendTextMessage(from, `📈 *Orders:*\n\n${list}`);
  }

  if (input === 'm_location') {
    return sendTextMessage(from, "📍 Send your location pin.");
  }

  return sendButtons(from, `🏪 *${merchant?.trading_name}* Dashboard`, [
    { id: 'm_orders', title: '📦 View Orders' },
    { id: 'm_location', title: '📍 Set Location' }
  ]);
}