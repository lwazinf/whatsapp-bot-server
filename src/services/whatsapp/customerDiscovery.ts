import { PrismaClient } from '@prisma/client';
import { sendTextMessage, sendListMessage } from './sender';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

const MAX_LIST_ROWS = 10;

export const handleCustomerDiscovery = async (from: string, input: string): Promise<void> => {
    // Handle Shop Search via @handle
    if (input.startsWith('@')) {
        const handle = input.replace('@', '').toLowerCase().trim();
        
        if (!handle) {
            await sendTextMessage(from, '⚠️ Please enter a shop handle after @\n\nExample: *@shopname*');
            return;
        }

        const merchant = await db.merchant.findFirst({ 
            where: { handle, status: 'ACTIVE' } 
        });

        if (!merchant) {
            await sendTextMessage(from, `❌ Shop *@${handle}* not found or is currently offline.`);
            return;
        }

        if (merchant.manual_closed) {
            await sendTextMessage(from, `🪪 *${merchant.trading_name}* is currently closed. Please check back later!`);
            return;
        }

        await upsertMerchantCustomer(merchant.id, from);

        const products = await db.product.findMany({ 
            where: { 
                merchant_id: merchant.id, 
                is_in_stock: true,
                status: 'ACTIVE'
            },
            take: MAX_LIST_ROWS,
            orderBy: { name: 'asc' }
        });
        
        if (products.length > 0) {
            const sections = [{
                title: 'Menu Items',
                rows: products.map(p => ({
                    id: `order_${merchant.id}_${p.id}`,
                    title: p.name.substring(0, 24),
                    description: `R${p.price.toFixed(2)}`
                }))
            }];

            const welcomeMsg = `👋 Welcome to *${merchant.trading_name}*!\n\n${merchant.description || 'Browse our menu below.'}`;
            await sendListMessage(from, welcomeMsg, '📖 View Menu', sections);
        } else {
            await sendTextMessage(from, `📋 *${merchant.trading_name}* hasn't added any products yet.`);
        }
        return;
    }

    // Handle Browse Shops
    if (input === 'browse_shops') {
        const merchants = await db.merchant.findMany({
            where: { status: 'ACTIVE', manual_closed: false },
            take: 10
        });

        if (merchants.length === 0) {
            await sendTextMessage(from, '🔍 No active shops found at the moment.');
            return;
        }

        let msg = '🪪 *Available Shops:*\n\n';
        merchants.forEach(m => {
            msg += `• *@${m.handle}* - ${m.trading_name}\n`;
        });
        msg += '\nType the *@handle* of a shop to view their menu!';
        
        await sendTextMessage(from, msg);
        return;
    }

    await sendTextMessage(from, '🔍 To find a shop, type *@shophandle*');
};

const upsertMerchantCustomer = async (merchantId: string, waId: string): Promise<void> => {
    await db.merchantCustomer.upsert({
        where: { merchant_id_wa_id: { merchant_id: merchantId, wa_id: waId } },
        create: { merchant_id: merchantId, wa_id: waId, last_interaction_at: new Date() },
        update: { last_interaction_at: new Date() }
    });
};
