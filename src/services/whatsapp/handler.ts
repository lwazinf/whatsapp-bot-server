import { PrismaClient } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();

export const handleIncomingMessage = async (message: any) => {
  const from = message.from;
  const text = message.text?.body?.trim();
  const location = message.location; // WhatsApp GPS pin

  // 1. Check/Create Session
  let session = await db.userSession.findUnique({ where: { wa_id: from } });
  if (!session) {
    session = await db.userSession.create({ data: { wa_id: from, mode: 'CUSTOMER' } });
  }

  // 2. Handle Global Commands
  if (text === 'SwitchOmeru') {
    const merchant = await db.merchant.findUnique({ where: { wa_id: from } });
    if (!merchant || !merchant.is_verified) {
      return sendTextMessage(from, "🚫 Access Denied. This number is not a verified Merchant.");
    }
    
    const newMode = session.mode === 'CUSTOMER' ? 'MERCHANT' : 'CUSTOMER';
    await db.userSession.update({
      where: { wa_id: from },
      data: { mode: newMode }
    });
    
    return sendTextMessage(from, `Switched to *${newMode}* mode.`);
  }

  // 3. Route Logic based on Mode
  if (session.mode === 'MERCHANT') {
    // Check for location pin first
    if (location) {
      await db.merchant.update({
        where: { wa_id: from },
        data: { latitude: location.latitude, longitude: location.longitude }
      });
      return sendTextMessage(from, "✅ *Location Updated!* Customers can now find your shop on the map.");
    }

    // Handle Button Responses or Menu
    const buttonId = message.interactive?.button_reply?.id || text;
    return handleMerchantMenu(from, buttonId);
  } else {
    return sendTextMessage(from, "Welcome to the Customer Shop! Type 'SwitchOmeru' if you are a merchant.");
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
    const list = orders.length ? orders.map(o => `📦 #${o.id.slice(-4)} - R${o.total}`).join('\n') : "No orders yet.";
    return sendTextMessage(from, `📈 *Recent Orders:*\n\n${list}`);
  }

  if (input === 'm_location') {
    return sendTextMessage(from, "📍 Please send your shop's location pin using the WhatsApp paperclip icon.");
  }

  // Default: Show Dashboard
  return sendButtons(from, `🏪 *${merchant?.trading_name}* Dashboard`, [
    { id: 'm_orders', title: '📦 View Orders' },
    { id: 'm_location', title: '📍 Set Location' }
  ]);
}