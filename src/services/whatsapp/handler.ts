import { PrismaClient, Merchant, MerchantStatus } from '@prisma/client';
import { handleMerchantAction } from './merchantEngine';
import { handleOnboardingAction } from './onboardingEngine';
import { handleCustomerDiscovery } from './customerDiscovery';
import { handleCustomerOrders } from './customerOrders';
import { sendTextMessage, sendButtons } from './sender';

// Singleton PrismaClient
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export const handleIncomingMessage = async (message: any): Promise<void> => {
    if (!message || !message.from) {
        console.error('❌ Invalid message received');
        return;
    }

    const from = message.from;
    
    // Extract input from various message types
    const textBody = message.text?.body;
    const buttonId = message.interactive?.button_reply?.id;
    const listId = message.interactive?.list_reply?.id;
    
    const input = String(buttonId || listId || textBody || '').trim();

    if (!input && message.type !== 'image' && message.type !== 'location') {
        console.log(`⚠️ Empty message from ${from}, skipping`);
        return;
    }

    try {
        // Get or create session
        const session = await db.userSession.upsert({
            where: { wa_id: from },
            update: {},
            create: { wa_id: from, mode: 'CUSTOMER' }
        });
        
        const merchantByWaId = await db.merchant.findUnique({ where: { wa_id: from } });
        const merchantByOwner = merchantByWaId
            ? null
            : await db.merchant.findFirst({ where: { owner_wa_ids: { has: from } } });
        const merchant = merchantByWaId || merchantByOwner;

        console.log(`📩 [${session.mode}] ${from}: "${input}"`);

        // Merchant Admin Access via @handle_admin
        const adminMatch = input.match(/^@([a-z0-9]+)_admin$/i);
        if (adminMatch) {
            const handle = adminMatch[1].toLowerCase();
            const targetMerchant = await db.merchant.findUnique({ where: { handle } });

            if (!targetMerchant) {
                await sendTextMessage(from, `❌ Shop *@${handle}* not found.`);
                return;
            }

            if (!isAuthorizedOwner(targetMerchant, from)) {
                await sendTextMessage(from, '❌ You are not authorized to access this merchant.');
                return;
            }

            const updatedSession = await db.userSession.update({
                where: { wa_id: from },
                data: { mode: 'MERCHANT', active_prod_id: null }
            });

            await handleMerchantAction(from, 'm_dashboard', updatedSession, targetMerchant, message);
            return;
        }

        // Global: Switch Modes
        if (input.toLowerCase() === 'switch' || input === 'SwitchOmeru') {
            const newMode = session.mode === 'CUSTOMER' ? 'MERCHANT' : 'CUSTOMER';
            await db.userSession.update({
                where: { wa_id: from },
                data: { mode: newMode }
            });
            await sendTextMessage(from, `🔄 Switched to *${newMode}* mode.`);
            return;
        }

        // Merchant & Onboarding Routing
        if (session.mode === 'REGISTERING' || (merchant && merchant.status !== MerchantStatus.ACTIVE)) {
            await handleOnboardingAction(from, input, session, merchant, message);
            return;
        }

        if (session.mode === 'MERCHANT') {
            if (!merchant) {
                await db.userSession.update({ where: { wa_id: from }, data: { mode: 'CUSTOMER' } });
                await sendTextMessage(from, '⚠️ Merchant profile not found. Switched to Customer mode.');
                return;
            }
            if (!isAuthorizedOwner(merchant, from)) {
                await db.userSession.update({ where: { wa_id: from }, data: { mode: 'CUSTOMER' } });
                await sendTextMessage(from, '⚠️ Unauthorized owner. Switched to Customer mode.');
                return;
            }
            await handleMerchantAction(from, input, session, merchant, message);
            return;
        }

        // Customer Routing
        if (input.startsWith('@') || input === 'browse_shops') {
            await handleCustomerDiscovery(from, input);
            return;
        }
        
        if (input === 'c_my_orders' || input.startsWith('view_order_')) {
            await handleCustomerOrders(from, input);
            return;
        }

        // Start merchant registration
        if (input.toLowerCase() === 'sell' || input.toLowerCase() === 'register') {
            await db.userSession.update({
                where: { wa_id: from },
                data: { mode: 'REGISTERING' }
            });
            await sendTextMessage(from, 
                '🏪 *Start Selling on Omeru!*\n\n' +
                "Let's set up your shop.\n\n" +
                '📝 *Step 1 of 6: Shop Name*\n' +
                'What is your trading/shop name?'
            );
            return;
        }

        // Default Customer Welcome
        await sendButtons(from, '👋 Welcome to *Omeru*!\n\nWhat would you like to do?', [
            { id: 'browse_shops', title: '🪪 Browse Shops' },
            { id: 'c_my_orders', title: '📦 My Orders' }
        ]);

    } catch (err: any) {
        console.error('❌ Handler Error:', err.message);
        await sendTextMessage(from, '⚠️ Something went wrong. Please try again.');
    }
};

const isAuthorizedOwner = (merchant: Merchant, waId: string): boolean => {
    return merchant.wa_id === waId || merchant.owner_wa_ids?.includes(waId);
};
