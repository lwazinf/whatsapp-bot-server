import { PrismaClient, MerchantStatus } from '@prisma/client';
import { handleMerchantAction } from './merchantEngine';
import { handleOnboardingAction } from './onboardingEngine';
import { handleCustomerDiscovery } from './customerDiscovery';
import { handleCustomerOrders } from './customerOrders';
import { sendTextMessage, sendButtons } from './sender';
import { handleAdminAction, isAdminNumber } from './adminEngine';
import { PLATFORM_NAME, PLATFORM_SWITCH_CODE, OWNER_INVITES_REQUIRED } from './config';
import { normalizeWaId } from './waId';
import { showMerchantDashboard } from './merchantDashboard';

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
    const normalizedFrom = normalizeWaId(from);
    
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
        
        let merchant = await db.merchant.findUnique({ where: { wa_id: from } });
        if (!merchant) {
            const ownerRecord = await db.merchantOwner.findFirst({
                where: { wa_id: normalizedFrom },
                include: { merchant: true }
            });
            merchant = ownerRecord?.merchant || null;
        }
        const invite = OWNER_INVITES_REQUIRED
            ? await db.merchantInvite.findUnique({ where: { wa_id: normalizedFrom } })
            : null;

        console.log(`📩 [${session.mode}] ${from}: "${input}"`);

        // Global: Switch Modes
        if (input.toLowerCase() === 'switch' || input === PLATFORM_SWITCH_CODE) {
            const newMode = session.mode === 'CUSTOMER' ? 'MERCHANT' : 'CUSTOMER';
            await db.userSession.update({
                where: { wa_id: from },
                data: { mode: newMode }
            });
            await sendTextMessage(from, `🔄 Switched to *${newMode}* mode.`);
            return;
        }

        if (isAdminNumber(from) && (session.state?.startsWith('ADMIN_') || input === 'admin' || input === 'admin_menu' || input === 'owners')) {
            await handleAdminAction(from, input, session);
            return;
        }

        const adminHandle = parseAdminHandle(input);
        if (adminHandle) {
            const targetMerchant = await db.merchant.findUnique({ where: { handle: adminHandle } });
            if (!targetMerchant) {
                await sendTextMessage(from, '❌ Store admin handle not found.');
                return;
            }
            const ownerRecord = await db.merchantOwner.findFirst({
                where: { merchant_id: targetMerchant.id, wa_id: normalizedFrom }
            });
            if (!ownerRecord) {
                await sendTextMessage(from, '⛔ You are not authorized for this store.');
                return;
            }
            await db.userSession.update({ where: { wa_id: from }, data: { mode: 'MERCHANT' } });
            await showMerchantDashboard(from, targetMerchant);
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
            if (!merchant && OWNER_INVITES_REQUIRED && !invite && !isAdminNumber(from)) {
                await sendTextMessage(
                    from,
                    `⚠️ You are not yet listed as a store owner.\n\nPlease contact *${PLATFORM_NAME}* to be added.`
                );
                return;
            }

            await db.userSession.update({
                where: { wa_id: from },
                data: { mode: 'REGISTERING' }
            });
            await sendTextMessage(from, 
                `🏪 *Start Selling on ${PLATFORM_NAME}!*\n\n` +
                "Let's set up your shop.\n\n" +
                '📝 *Step 1 of 6: Shop Name*\n' +
                'What is your trading/shop name?'
            );
            return;
        }

        // Default Customer Welcome
        await sendButtons(from, `👋 Welcome to *${PLATFORM_NAME}*!\n\nWhat would you like to do?`, [
            { id: 'browse_shops', title: '🪪 Browse Shops' },
            { id: 'c_my_orders', title: '📦 My Orders' }
        ]);

    } catch (err: any) {
        console.error('❌ Handler Error:', err.message);
        await sendTextMessage(from, '⚠️ Something went wrong. Please try again.');
    }
};

const parseAdminHandle = (input: string): string | null => {
    if (!input.startsWith('@') || !input.endsWith('_admin')) {
        return null;
    }
    const handle = input.slice(1, -6).trim();
    if (handle.length < 3) {
        return null;
    }
    return handle;
};
