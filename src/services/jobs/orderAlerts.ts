import { OrderStatus } from '@prisma/client';
import { sendButtons } from '../whatsapp/sender';
import { formatCurrency } from '../whatsapp/messageTemplates';
import { getPlatformBranding } from '../whatsapp/platformBranding';
import { db } from '../../lib/db';

const STALE_MINUTES = 10;
const MAX_ALERTS = 2;

export const checkStaleOrders = async (): Promise<void> => {
    try {
        const threshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

        const platformBranding = await getPlatformBranding(db);
        const orders = await db.order.findMany({
            where: {
                status: { in: [OrderStatus.PENDING, OrderStatus.PAID] },
                createdAt: { lt: threshold },
                alert_count: { lt: MAX_ALERTS }
            },
            include: { merchant: { include: { branding: true } } }
        });

        if (orders.length === 0) {
            console.log('📭 No stale orders');
            return;
        }

        console.log(`📋 ${orders.length} stale order(s)`);

        for (const order of orders) {
            if (!order.merchant?.wa_id) continue;

            const mins = Math.floor((Date.now() - order.createdAt.getTime()) / 60000);
            const alertNum = (order.alert_count || 0) + 1;

            await sendButtons(
                order.merchant.wa_id,
                `🔔 *Order Alert*\n\n📦 #${order.id.slice(-5)}\n⏱️ ${mins}m waiting\n💰 ${formatCurrency(order.total, { merchant: order.merchant, merchantBranding: order.merchant.branding, platform: platformBranding })}\n\n_Alert ${alertNum}/${MAX_ALERTS}_`,
                [
                    { id: `view_kitchen_${order.id}`, title: '👨‍🍳 View' },
                    { id: `ready_${order.id}`, title: '✅ Ready' }
                ]
            );

            await db.order.update({
                where: { id: order.id },
                data: { alert_count: { increment: 1 } }
            });

            // Small delay
            await new Promise(r => setTimeout(r, 500));
        }

    } catch (error: any) {
        console.error('❌ Stale order check error:', error.message);
        throw error;
    }
};
