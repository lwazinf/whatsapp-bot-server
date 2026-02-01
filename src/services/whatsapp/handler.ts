import { PrismaClient } from '@prisma/client';
import { sendTextMessage } from './sender';

const db = new PrismaClient();

export const handleIncomingMessage = async (body: any) => {
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return;

  const from = message.from;
  const text = message.text?.body || '';

  // 1. Check/Update Session (The 10-Minute Rule)
  const now = new Date();
  let session = await db.userSession.upsert({
    where: { wa_id: from },
    update: { last_active: now },
    create: { wa_id: from, mode: 'CUSTOMER' }
  });

  // 2. THE SwitchOmeru TOGGLE
  if (text === 'SwitchOmeru') {
    const merchant = await db.merchant.findUnique({ where: { wa_id: from } });

    // Security: Silent ignore if not a verified merchant
    if (!merchant || !merchant.is_verified) return;

    const newMode = session.mode === 'MERCHANT' ? 'CUSTOMER' : 'MERCHANT';
    await db.userSession.update({
      where: { wa_id: from },
      data: { mode: newMode }
    });

    const statusMsg = newMode === 'MERCHANT' ? "🔓 **Merchant Mode Active**" : "🔄 **Customer Mode Active**";
    return sendTextMessage(from, statusMsg);
  }

  // 3. Routing
  if (session.mode === 'MERCHANT') {
    // We'll build the Merchant Dashboard functions next!
    return sendTextMessage(from, "Backstage Tools: Reply *LOC* to update delivery spot.");
  } else {
    return sendTextMessage(from, "Welcome to Omeru! 🛍️");
  }
};