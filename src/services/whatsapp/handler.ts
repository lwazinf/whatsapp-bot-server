import { PrismaClient, Mode, MerchantStatus, OrderStatus } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();
const ADMIN_NUMBER = "27746854339"; // Your number

export const handleIncomingMessage = async (webhookData: any) => {
  const value = webhookData.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return;

  const from = message.from;
  const textBody = message.text?.body?.trim();
  const input = message.interactive?.button_reply?.id || textBody;
  const location = message.location;

  try {
    // Establish or get session
    let session = await db.userSession.findUnique({ where: { wa_id: from } });
    if (!session) session = await db.userSession.create({ data: { wa_id: from, mode: Mode.CUSTOMER } });

    const merchant = await db.merchant.findUnique({ where: { wa_id: from } });

    // --- GATEKEEPER: ROLE SWITCHING ---
    if (input === 'SwitchOmeru') {
      if (from === ADMIN_NUMBER) {
        const nextMode = session.mode === Mode.ADMIN ? Mode.CUSTOMER : Mode.ADMIN;
        await db.userSession.update({ where: { wa_id: from }, data: { mode: nextMode } });
        return nextMode === Mode.ADMIN ? sendAdminDashboard(from) : sendTextMessage(from, "Switched to *Customer Mode*.");
      }

      if (merchant) {
        if (merchant.status === MerchantStatus.REVOKED) return; 
        if (merchant.status === MerchantStatus.PAUSED) return sendTextMessage(from, "⏸ Your merchant account is paused.");

        if (!merchant.trading_name) {
          await db.userSession.update({ where: { wa_id: from }, data: { mode: Mode.REGISTERING } });
          return sendTextMessage(from, "👋 Authorization confirmed. Please reply with your *Business Name* to setup shop:");
        }

        const nextMode = session.mode === Mode.MERCHANT ? Mode.CUSTOMER : Mode.MERCHANT;
        await db.userSession.update({ where: { wa_id: from }, data: { mode: nextMode } });
        return nextMode === Mode.MERCHANT ? sendMerchantDashboard(from, merchant) : sendTextMessage(from, "Switched to *Customer Mode*.");
      }
      return; // Silent if not authorized
    }

    // --- ADMIN SPECIFIC OVERRIDES ---
    if (session.mode === Mode.ADMIN && from === ADMIN_NUMBER) {
      if (input.startsWith('Approve_')) {
        const target = input.split('_')[1];
        await db.merchant.update({ where: { wa_id: target }, data: { status: MerchantStatus.ACTIVE } });
        await sendTextMessage(target, "🎉 *Omeru Update:* Your store is now ACTIVE! Type *SwitchOmeru* to login.");
        return sendTextMessage(from, `✅ Activated: ${target}`);
      }

      // Super-Admin Command: "AddMerchant_27123456789"
      if (input.startsWith('AddMerchant_')) {
        const target = input.split('_')[1];
        await db.merchant.upsert({
          where: { wa_id: target },
          update: { status: MerchantStatus.ACTIVE },
          create: { wa_id: target, status: MerchantStatus.ACTIVE }
        });
        return sendTextMessage(from, `🏪 Pre-approved Merchant: ${target}`);
      }

      if (input === 'adm_tx_30') return sendTransactionReport(from, 30);
      if (input === 'adm_tx_90') return sendTransactionReport(from, 90);
      if (input === 'adm_pending') return handleAdminPending(from);
    }

    // --- STATE ROUTING ---
    switch (session.mode) {
      case Mode.ADMIN: return sendAdminDashboard(from);
      case Mode.MERCHANT: return handleMerchantFlow(from, input, merchant, location);
      case Mode.REGISTERING: return handleRegistrationFlow(from, input);
      default: return handleCustomerFlow(from, input);
    }
  } catch (error) {
    console.error("❌ Critical Logic Error:", error);
  }
};

async function handleAdminPending(from: string) {
  const pending = await db.merchant.findMany({ where: { status: MerchantStatus.PENDING } });
  if (!pending.length) return sendTextMessage(from, "✅ No pending requests.");
  for (const p of pending) {
    await sendButtons(from, `Shop: ${p.trading_name}\nPhone: ${p.wa_id}`, [
      { id: `Approve_${p.wa_id}`, title: '✅ Approve' }
    ]);
  }
}

async function sendTransactionReport(to: string, days: number) {
  const dateLimit = new Date();
  dateLimit.setDate(dateLimit.getDate() - days);
  const stats = await db.order.aggregate({
    where: { createdAt: { gte: dateLimit }, status: OrderStatus.PAID },
    _sum: { amount: true },
    _count: { id: true }
  });
  const total = stats._sum.amount || 0;
  return sendTextMessage(to, `📊 *${days} Day Report*\n\n💰 Revenue: R${total}\n📦 Count: ${stats._count.id}`);
}

async function handleMerchantFlow(from: string, input: string, merchant: any, location?: any) {
  if (location) {
    await db.merchant.update({ where: { wa_id: from }, data: { latitude: location.latitude, longitude: location.longitude } });
    await sendTextMessage(from, "📍 Location pinned!");
    return sendMerchantDashboard(from, merchant);
  }
  if (input === 'm_orders') {
    const orders = await db.order.findMany({ where: { merchant_id: merchant.id }, take: 5, orderBy: { createdAt: 'desc' } });
    const list = orders.map(o => `🔸 R${o.amount} - ${o.status}`).join('\n');
    await sendTextMessage(from, `📦 *Orders:*\n\n${list || "No orders."}`);
    return sendMerchantDashboard(from, merchant);
  }
  return sendMerchantDashboard(from, merchant);
}

async function handleRegistrationFlow(from: string, input: string) {
  await db.merchant.update({ where: { wa_id: from }, data: { trading_name: input, status: MerchantStatus.PENDING } });
  await db.userSession.update({ where: { wa_id: from }, data: { mode: Mode.CUSTOMER } });
  await sendTextMessage(ADMIN_NUMBER, `🔔 *Alert:* Registration from ${input} (${from})`);
  return sendTextMessage(from, "✅ Saved. Admin will review and activate your store.");
}

async function handleCustomerFlow(from: string, input: string) {
  if (input?.toLowerCase() === 'hi') return sendTextMessage(from, "Welcome to Omeru! 🛍️");
}

function sendAdminDashboard(to: string) {
  return sendButtons(to, "💎 *Omeru Admin*", [
    { id: 'adm_pending', title: '⏳ Pending' },
    { id: 'adm_tx_30', title: '💰 Last 30 Days' },
    { id: 'adm_tx_90', title: '💰 Last 90 Days' }
  ]);
}

function sendMerchantDashboard(to: string, merchant: any) {
  return sendButtons(to, `🏪 *${merchant.trading_name}*`, [
    { id: 'm_orders', title: '📦 Orders' },
    { id: 'm_location', title: '📍 Update Location' }
  ]);
}