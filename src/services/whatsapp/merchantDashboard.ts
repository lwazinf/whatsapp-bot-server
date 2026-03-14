import { Merchant } from '@prisma/client';
import { sendButtons, sendTextMessage } from './sender';
import { formatCurrency } from './messageTemplates';
import { getPlatformBranding } from './platformBranding';
import { db } from '../../lib/db';

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

        const platformBranding = await getPlatformBranding(db);
        const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: merchant.id } });

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [pendingCount, todayOrders, todayRevenue] = await Promise.all([
            db.order.count({
                where: { merchant_id: merchant.id, status: { in: ['PENDING', 'PAID'] } }
            }),
            db.order.count({
                where: { merchant_id: merchant.id, createdAt: { gte: todayStart } }
            }),
            db.order.aggregate({
                where: {
                    merchant_id: merchant.id,
                    createdAt: { gte: todayStart },
                    status: { in: ['PAID', 'READY_FOR_PICKUP', 'COMPLETED'] }
                },
                _sum: { total: true }
            })
        ]);

        const statusBadge = merchant.manual_closed ? '🔴 Closed' : '🟢 Open';
        const revenueToday = todayRevenue._sum.total ?? 0;

        let card = `🏪 *${merchant.trading_name}*  ${statusBadge}\n`;
        card += `━━━━━━━━━━━━━━━━━━━━\n`;
        card += `📅 *Today*\n`;
        card += `Orders:   ${todayOrders}  |  Pending: ${pendingCount}\n`;
        card += `Revenue:  ${formatCurrency(revenueToday, { merchant, merchantBranding, platform: platformBranding })}\n`;
        card += `━━━━━━━━━━━━━━━━━━━━`;

        const kitchenTitle = pendingCount > 0 ? `🍳 Kitchen (${pendingCount})` : '🍳 Kitchen';

        const toggleTitle = merchant.manual_closed ? '🔓 Open Shop' : '🔒 Close Shop';
        await sendButtons(to, card, [
            { id: 'm_kitchen', title: kitchenTitle.substring(0, 20) },
            { id: 'm_inventory', title: '📦 Products' },
            { id: 'dash_toggle', title: toggleTitle }
        ]);
        await sendButtons(to, '⚡ More:', [
            { id: 'm_stats', title: '📊 Stats' },
            { id: 'm_broadcast', title: '📣 Broadcast' },
            { id: 'm_settings', title: '🛠️ Settings' }
        ]);
        await sendButtons(to, '💬 Got feedback?', [
            { id: 'm_feedback', title: '💬 Send Feedback' }
        ]);

    } catch (error: any) {
        console.error(`❌ Dashboard Error: ${error.message}`);
        await sendTextMessage(to, '⚠️ Error loading dashboard.');
    }
};
