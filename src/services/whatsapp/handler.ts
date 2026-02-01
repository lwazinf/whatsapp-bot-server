import { PrismaClient, Mode, MerchantStatus, OrderStatus } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();
const ADMIN_NUMBER = "27746854339";

export const handleIncomingMessage = async (webhookData: any) => {
  const value = webhookData.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return;

  const from = message.from;
  const input = message.interactive?.button_reply?.id || message.text?.body?.trim();
  const image = message.image;

  try {
    let session = await db.userSession.findUnique({ where: { wa_id: from } });
    if (!session) session = await db.userSession.create({ data: { wa_id: from, mode: Mode.CUSTOMER } });

    const merchant = await db.merchant.findUnique({ where: { wa_id: from }, include: { hours: true, products: true } });

    // --- SWITCH LOGIC ---
    if (input === 'SwitchOmeru') {
        let nextMode: Mode = Mode.CUSTOMER;
        if (from === ADMIN_NUMBER) {
            if (session.mode === Mode.ADMIN) nextMode = Mode.MERCHANT;
            else if (session.mode === Mode.MERCHANT) nextMode = Mode.CUSTOMER;
            else nextMode = Mode.ADMIN;
        } else if (merchant?.status === MerchantStatus.ACTIVE) {
            nextMode = session.mode === Mode.MERCHANT ? Mode.CUSTOMER : Mode.MERCHANT;
        }
        await db.userSession.update({ where: { wa_id: from }, data: { mode: nextMode } });
        return routeToDashboard(from, nextMode, merchant);
    }

    // --- REGISTRATION FLOW (ID & BANK) ---
    if (session.mode === Mode.REGISTERING) {
        return handleDetailedRegistration(from, input, image, merchant);
    }

    // --- MERCHANT CORE ---
    if (session.mode === Mode.MERCHANT && merchant) {
        // Complete Order (Customer Picked Up)
        if (input.startsWith('complete_')) {
            const oid = input.replace('complete_', '');
            await db.order.update({ where: { id: oid }, data: { status: OrderStatus.COMPLETED } });
            return sendTextMessage(from, "✅ Order marked as Completed. It is now eligible for Friday's payout.");
        }
        
        if (input === 'm_settings') {
            return sendButtons(from, "⚙️ *Merchant Settings*", [
                { id: 'm_bank_edit', title: '🏦 Update Bank' },
                { id: 'm_hours_edit', title: '🕒 Update Hours' }
            ]);
        }
    }

    // Standard Fallback
    return routeToDashboard(from, session.mode, merchant);

  } catch (error) { console.error("❌ Error:", error); }
};

/**
 * KYC & BANK REGISTRATION
 */
async function handleDetailedRegistration(from: string, input: string, image: any, merchant: any) {
    if (!merchant.id_number) {
        // ... (Previous steps for Trading Name, Legal Name, ID No)
    }

    if (!merchant.id_photo_url) {
        if (image) {
            await db.merchant.update({ where: { wa_id: from }, data: { id_photo_url: image.id } });
            return sendTextMessage(from, "🏦 *Bank Details:* Please reply with your Bank Name, Account Number, and Type (e.g., FNB, 123456789, Savings):");
        }
        return sendTextMessage(from, "📸 Please upload a clear *Photo of your ID* for verification:");
    }

    if (!merchant.bank_acc_no) {
        const parts = input.split(',').map(p => p.trim());
        if (parts.length < 2) return sendTextMessage(from, "⚠️ Please use the format: Bank Name, Account Number, Type");
        await db.merchant.update({ 
            where: { wa_id: from }, 
            data: { bank_name: parts[0], bank_acc_no: parts[1], bank_type: parts[2] || 'Savings' } 
        });
        
        const legalText = `⚖️ *TERMS:* Payouts every Friday. 7% flat fee. Refunds deduct gateway fees from Merchant. Accept?`;
        return sendButtons(from, legalText, [{ id: 'accept_legal', title: '✅ I Accept' }]);
    }

    if (input === 'accept_legal') {
        await db.merchant.update({ where: { wa_id: from }, data: { accepted_terms: true } });
        await db.userSession.update({ where: { wa_id: from }, data: { mode: Mode.CUSTOMER } });
        return sendTextMessage(from, "✅ All set! OMERU will verify your ID and bank details. We'll notify you when your shop is live.");
    }
}

async function routeToDashboard(to: string, mode: Mode, merchant?: any) {
    if (mode === Mode.ADMIN) return sendButtons(to, "💎 Admin", [{id: 'adm_gen_payouts', title: '🧾 Payouts'}]);
    if (mode === Mode.MERCHANT) {
        return sendButtons(to, `🏪 *${merchant?.trading_name}*`, [
            { id: 'm_products', title: '📦 Inventory' },
            { id: 'm_payout', title: '💰 Payout' },
            { id: 'm_settings', title: '⚙️ Settings' }
        ]);
    }
    return sendTextMessage(to, "Mode: *Customer View* 🛒");
}