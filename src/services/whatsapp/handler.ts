import { PrismaClient, MerchantStatus } from '@prisma/client';
import { handleMerchantAction } from './merchantEngine';
import { handleOnboardingAction } from './onboardingEngine';
import { handleCustomerDiscovery } from './customerDiscovery';
import { handleCustomerOrders } from './customerOrders';
import { sendTextMessage, sendButtons } from './sender';
import {
    browseShopsLabel,
    genericErrorMessage,
    merchantNotFoundMessage,
    myOrdersLabel,
    startSellingMessage,
    switchModeMessage,
    welcomeMessage
} from './templates';

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
        
        const merchant = await db.merchant.findUnique({ where: { wa_id: from } });

        console.log(`📩 [${session.mode}] ${from}: "${input}"`);

        // Global: Switch Modes
        if (input.toLowerCase() === 'switch' || input === 'SwitchOmeru') {
            const newMode = session.mode === 'CUSTOMER' ? 'MERCHANT' : 'CUSTOMER';
            await db.userSession.update({
                where: { wa_id: from },
                data: { mode: newMode }
            });
            await sendTextMessage(from, switchModeMessage(newMode));
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
                await sendTextMessage(from, merchantNotFoundMessage());
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
            await sendTextMessage(from, startSellingMessage());
            return;
        }

        // Default Customer Welcome
        await sendButtons(from, welcomeMessage(), [
            { id: 'browse_shops', title: browseShopsLabel() },
            { id: 'c_my_orders', title: myOrdersLabel() }
        ]);

    } catch (err: any) {
        console.error('❌ Handler Error:', err.message);
        await sendTextMessage(from, genericErrorMessage());
    }
};
