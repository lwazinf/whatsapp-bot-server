import { PrismaClient, Merchant } from '@prisma/client';
import { sendButtons, sendTextMessage } from './sender';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

type MerchantStats = {
    salesTotal: number;
    pendingOrders: number;
    activeProducts: number;
    archivedProducts: number;
    recentOrders: Array<{ id: string; total: number; status: string; createdAt: Date }>;
};

export const getMerchantStats = async (merchantId: string): Promise<MerchantStats> => {
    const [
        salesTotal,
        pendingOrders,
        activeProducts,
        archivedProducts,
        recentOrders
    ] = await Promise.all([
        db.order.aggregate({
            where: {
                merchant_id: merchantId,
                status: { in: ['PAID', 'READY_FOR_PICKUP', 'COMPLETED'] }
            },
            _sum: { total: true }
        }),
        db.order.count({
            where: {
                merchant_id: merchantId,
                status: { in: ['PENDING', 'PAID'] }
            }
        }),
        db.product.count({
            where: { merchant_id: merchantId, status: 'ACTIVE' }
        }),
        db.product.count({
            where: { merchant_id: merchantId, status: { not: 'ACTIVE' } }
        }),
        db.order.findMany({
            where: { merchant_id: merchantId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                id: true,
                total: true,
                status: true,
                createdAt: true
            }
        })
    ]);

    return {
        salesTotal: salesTotal._sum.total ?? 0,
        pendingOrders,
        activeProducts,
        archivedProducts,
        recentOrders
    };
};

export const showMerchantDashboard = async (to: string, merchant: Merchant): Promise<void> => {
    try {
        // Clear any active state
        await db.userSession.update({ 
            where: { wa_id: to }, 
            data: { active_prod_id: null } 
        });
        
        const status = merchant.manual_closed ? '🔴 CLOSED' : '🟢 OPEN';
        
        // Get pending orders count
        const pendingCount = await db.order.count({
            where: { 
                merchant_id: merchant.id, 
                status: { in: ['PENDING', 'PAID'] } 
            }
        });

        let msg = `🏪 *${merchant.trading_name}*\n`;
        msg += `📍 Status: ${status}\n`;
        
        if (pendingCount > 0) {
            msg += `\n🔔 *${pendingCount} order${pendingCount > 1 ? 's' : ''} waiting!*\n`;
        }
        
        msg += '\nManage your store below.';

        const kitchenTitle = pendingCount > 0 ? `🍳 Kitchen (${pendingCount})` : '🍳 Kitchen';

        await sendButtons(to, msg, [
            { id: 'm_kitchen', title: kitchenTitle.substring(0, 20) },
            { id: 'm_inventory', title: '📦 My Menu' },
            { id: 'm_stats', title: '📊 Stats' }
        ]);
        await sendButtons(to, 'More options:', [
            { id: 'm_settings', title: '🛠️ Settings' }
        ]);

    } catch (error: any) {
        console.error(`❌ Dashboard Error: ${error.message}`);
        await sendTextMessage(to, '⚠️ Error loading dashboard.');
    }
};
