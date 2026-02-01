import { PrismaClient } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();

export const handleIncomingMessage = async (body: any) => {
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];

  if (!message) return;

  const from = message.from;
  const type = message.type;
  
  // 1. Extract inputs based on type
  const location = message.location; 
  let incomingText = '';

  if (type === 'text') {
    incomingText = message.text?.body || '';
  } else if (type === 'interactive') {
    // This captures clicks from the buttons we send
    incomingText = message.interactive?.reply?.id || '';
  }

  try {
    // 2. Session Management
    let session = await db.userSession.upsert({
      where: { wa_id: from },
      update: { last_active: new Date() },
      create: { wa_id: from, mode: 'CUSTOMER' }
    });

    // 3. Handle Merchant Location Pin
    if (location && session.mode === 'MERCHANT') {
      await db.merchant.update({
        where: { wa_id: from },
        data: {
          latitude: location.latitude,
          longitude: location.longitude,
        }
      });
      return sendTextMessage(from, "📍 *Location Saved!* Your shop is now pinned on the map for customers.");
    }

    // 4. Mode Switcher
    if (incomingText === 'SwitchOmeru') {
      const merchant = await db.merchant.findUnique({ where: { wa_id: from } });
      if (!merchant) return sendTextMessage(from, "❌ You are not registered as a merchant.");

      const newMode = session.mode === 'MERCHANT' ? 'CUSTOMER' : 'MERCHANT';
      await db.userSession.update({ where: { wa_id: from }, data: { mode: newMode } });

      if (newMode === 'MERCHANT') {
        return sendButtons(from, `🏪 *Merchant Mode: ON*\nWelcome back, ${merchant.trading_name}!`, [
          { id: 'm_orders', title: '📦 View Orders' },
          { id: 'm_location', title: '📍 Update Pin' }
        ]);
      }
      return sendTextMessage(from, "👤 *Customer Mode: ON*");
    }

    // 5. Routing
    if (session.mode === 'MERCHANT') {
      return handleMerchantLogic(from, incomingText);
    } 
    
    // Default Customer greeting
    return sendTextMessage(from, "Welcome to Omeru! Type 'SwitchOmeru' if you are a merchant.");

  } catch (err) {
    console.error("Handler Error:", err);
  }
};

async function handleMerchantLogic(from: string, input: string) {
  // 1. Fetch the merchant record we just created
  const merchant = await db.merchant.findUnique({ where: { wa_id: from } });

  if (!merchant) {
    return sendTextMessage(from, "❌ Merchant profile not found. Please contact support.");
  }

  // 2. Handle specific button IDs or text commands
  switch (input) {
    case 'm_orders':
      const orders = await db.order.findMany({
        where: { merchant_id: merchant.id },
        take: 3,
        orderBy: { createdAt: 'desc' }
      });

      if (orders.length === 0) {
        return sendTextMessage(from, "📦 *No active orders yet.* When customers order, they will appear here!");
      }

      const orderList = orders.map(o => 
        `🔸 *Order #${o.id.slice(-4)}*\nStatus: ${o.status}\nTotal: R${o.total}`
      ).join('\n\n');
      
      return sendTextMessage(from, `📈 *Your Recent Orders:*\n\n${orderList}`);

    case 'm_location':
      return sendTextMessage(from, "📍 *Update Your Shop Location*\nPlease use the WhatsApp 'Location' feature (📎 > Location) to send your shop's current pin.");

    default:
      // This is the "Main Menu" they see upon switching
      return sendButtons(from, `🏪 *${merchant.trading_name} Dashboard*`, [
        { id: 'm_orders', title: '📦 View Orders' },
        { id: 'm_location', title: '📍 Set Location' }
      ]);
  }
}