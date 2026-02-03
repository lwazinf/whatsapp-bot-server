import { PrismaClient, MerchantStatus } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';
import { handleOnboardingAction } from './onboardingEngine';
import { handleMerchantAction, showMerchantDashboard } from './merchantEngine';

// Prisma Singleton for Railway/Supabase
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
        // 1. Fetch Session & Merchant
        const session = await db.userSession.upsert({
            where: { wa_id: from },
            update: {},
            create: { wa_id: from, mode: 'CUSTOMER' }
        });

        const merchant = await db.merchant.findUnique({
            where: { wa_id: from }
        });

        console.log(`📩 [${session.mode}] ${from}: "${input}"`);

        // 2. Global "Escape" Commands
        if (input.toLowerCase() === 'reset') {
            await db.userSession.update({ where: { wa_id: from }, data: { mode: 'CUSTOMER', active_prod_id: null } });
            return sendTextMessage(from, "🔄 Session reset. You are now in Customer mode.");
        }

        // 3. Routing Logic based on Session Mode
        
        // --- REGISTRATION MODE ---
        if (session.mode === 'REGISTERING') {
            // Create a shell merchant record if it doesn't exist yet
            if (!merchant) {
                const handle = `shop_${from.slice(-4)}_${Math.floor(Math.random() * 1000)}`;
                const newMerchant = await db.merchant.create({
                    data: { 
                        wa_id: from, 
                        trading_name: '', 
                        handle: handle,
                        status: MerchantStatus.ONBOARDING 
                    }
                });
                return handleOnboardingAction(from, input, session, newMerchant);
            }
            return handleOnboardingAction(from, input, session, merchant);
        }

        // --- MERCHANT MODE ---
        if (session.mode === 'MERCHANT' && merchant) {
            // Handle images (for product creation) separately
            if (message.type === 'image' || session.active_prod_id || buttonId || textBody) {
                return handleMerchantAction(from, input, session, merchant, message);
            }
            return showMerchantDashboard(from, merchant);
        }

        // --- CUSTOMER MODE (Default) ---
        
        // Trigger Registration
        if (input.toLowerCase() === 'sell' || input.toLowerCase() === 'register') {
            await db.userSession.update({ where: { wa_id: from }, data: { mode: 'REGISTERING' } });
            return sendTextMessage(from, "🏪 *Shop Registration*\n\nWhat is the **Trading Name** of your shop?");
        }

        // Trigger Merchant Dashboard (if already a merchant)
        if (input.toLowerCase() === 'merchant' && merchant) {
            await db.userSession.update({ where: { wa_id: from }, data: { mode: 'MERCHANT' } });
            return showMerchantDashboard(from, merchant);
        }

        // Standard Customer Menu
        const welcomeText = "👋 *Welcome to Omeru*\n\nBuy local products directly on WhatsApp.";
        const buttons = [
            { id: 'browse', title: '🛍️ Browse Shops' },
            { id: 'sell', title: '🏪 Start Selling' }
        ];

        // Add "Merchant Dashboard" button if they already own a shop
        if (merchant) {
            buttons.push({ id: 'merchant', title: '⚙️ Shop Manager' });
        }

        return sendButtons(from, welcomeText, buttons);

    } catch (err) {
        console.error("❌ Critical Handler Error:", err);
        return sendTextMessage(from, "⚠️ Our systems are currently syncing. Please try again in 1 minute.");
    }
};