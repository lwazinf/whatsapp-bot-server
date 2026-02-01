import { PrismaClient } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();

export const handleIncomingMessage = async (webhookData: any) => {
  // 360Dialog delivers messages in an array inside 'messages'
  const message = webhookData.messages?.[0];
  if (!message) return;

  const from = message.from; 
  
  // CRASH FIX: Ensure 'from' is present before calling Prisma
  if (!from) {
    console.error("❌ No sender ID found in webhook data");
    return;
  }

  // Extract text, button click, or location
  const textBody = message.text?.body?.trim();
  const buttonId = message.interactive?.button_reply?.id;
  const location = message.location;

  // Final command input (priority to button clicks)
  const input = buttonId || textBody;

  // 1. Manage/Fetch Session
  let session = await db.userSession.findUnique({ where: { wa_id: from } });
  if (!session) {
    session = await db.userSession.create({ data: { wa_id: from, mode: 'CUSTOMER' } });
  }

  // 2. Global Toggle Command
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

  // 3. Routing based on current Session Mode
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
    // Basic Customer response
    return sendTextMessage(from, "Welcome! Type 'SwitchOmeru' if you are a registered merchant.");
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