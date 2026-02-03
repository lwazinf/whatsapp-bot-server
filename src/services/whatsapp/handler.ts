import { PrismaClient, MerchantStatus } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

// Prisma Singleton for Railway/Supabase connection pooling
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export const handleIncomingMessage = async (message: any) => {
    if (!message || !message.from) return;

    const from = message.from;
    const textBody = message.text?.body;
    const buttonId = message.interactive?.button_reply?.id;
    const listId = message.interactive?.list_reply?.id;
    const input = String(buttonId || listId || textBody || "").trim();

    try {
        // 1. Session & Merchant Lookup
        const session = await db.userSession.upsert({
            where: { wa_id: from },
            update: {},
            create: { wa_id: from, mode: 'CUSTOMER' }
        });

        const merchant = await db.merchant.findUnique({
            where: { wa_id: from }
        });

        console.log(`📩 [${session.mode}] ${from}: "${input}"`);

        // 2. Global Commands
        if (input.toLowerCase() === 'reset') {
            await db.userSession.update({ where: { wa_id: from }, data: { mode: 'CUSTOMER' } });
            return sendTextMessage(from, "🔄 Session reset to Customer mode.");
        }

        // 3. Routing Logic

        // --- REGISTRATION FLOW ---
        if (session.mode === 'REGISTERING') {
            if (input.length < 3) {
                return sendTextMessage(from, "⚠️ Shop Name too short. Please send a valid name.");
            }

            const cleanHandle = input.toLowerCase().replace(/\s+/g, '_').substring(0, 15);
            
            await db.merchant.upsert({
                where: { wa_id: from },
                create: {
                    wa_id: from,
                    trading_name: input,
                    handle: `${cleanHandle}_${from.slice(-4)}`,
                    status: MerchantStatus.ACTIVE
                },
                update: {
                    trading_name: input,
                    status: MerchantStatus.ACTIVE
                }
            });

            await db.userSession.update({
                where: { wa_id: from },
                data: { mode: 'MERCHANT' }
            });

            return sendButtons(from, `🎉 *${input}* is now live on Omeru!`, [
                { id: 'm_dashboard', title: '🏠 Dashboard' },
                { id: 'reset', title: '🔄 Back to Customer' }
            ]);
        }

        // --- MERCHANT DASHBOARD ---
        if (session.mode === 'MERCHANT' && merchant) {
            return sendButtons(from, `🏪 *Merchant Dashboard: ${merchant.trading_name}*\nStatus: Active ✅`, [
                { id: 'm_inventory', title: '📦 Inventory' },
                { id: 'm_orders', title: '📋 Orders' },
                { id: 'reset', title: '🔄 Switch to Customer' }
            ]);
        }

        // --- CUSTOMER WELCOME (Default) ---
        if (input.toLowerCase() === 'sell' || input.toLowerCase() === 'register') {
            await db.userSession.update({ where: { wa_id: from }, data: { mode: 'REGISTERING' } });
            return sendTextMessage(from, "🏪 *Start Selling!*\n\nWhat is your **Shop Name**?");
        }

        return sendButtons(from, "👋 *Welcome to Omeru*\n\nYour local marketplace. What would you like to do today?", [
            { id: 'browse', title: '🛍️ Browse Shops' },
            { id: 'sell', title: '🏪 Register Shop' },
            { id: 'c_orders', title: '📦 My Orders' }
        ]);

    } catch (err) {
        console.error("❌ Handler Error:", err);
        return sendTextMessage(from, "⚠️ System update in progress. Please try again in a moment.");
    }
};