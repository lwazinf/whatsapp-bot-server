import { sendTextMessage, sendButtons } from './sender';
import { formatCurrency } from './messageTemplates';
import { getPlatformBranding } from './platformBranding';
import { db } from '../../lib/db';

export const handleCustomerOrders = async (from: string, input: string): Promise<void> => {
    if (input === 'c_my_orders') {
        const platformBranding = await getPlatformBranding(db);
        const orders = await db.order.findMany({
            where: { customer_id: from },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { merchant: { include: { branding: true } } }
        });

        if (orders.length === 0) {
            await sendTextMessage(from, '📭 You have no recent orders.\n\nBrowse shops to place your first order!');
            return;
        }

        let msg = '📦 *Your Recent Orders*\n\n';
        orders.forEach(o => {
            const emoji = getStatusEmoji(o.status);
            msg += `${emoji} #${o.id.slice(-5)} - ${formatCurrency(o.total, { merchant: o.merchant, merchantBranding: o.merchant?.branding, platform: platformBranding })}\n`;
            msg += `   ${o.merchant?.trading_name || 'Shop'} • ${formatStatus(o.status)}\n\n`;
        });

        const buttons = orders.slice(0, 3).map(o => ({
            id: `view_order_${o.id}`,
            title: `#${o.id.slice(-5)}`
        }));

        await sendButtons(from, msg, buttons);
        return;
    }

    if (input.startsWith('view_order_')) {
        const platformBranding = await getPlatformBranding(db);
        const orderId = input.replace('view_order_', '');
        
        const order = await db.order.findUnique({
            where: { id: orderId },
            include: {
                order_items: { include: { product: true } },
                merchant: { include: { branding: true } }
            }
        });

        if (!order || order.customer_id !== from) {
            await sendTextMessage(from, '❌ Order not found.');
            return;
        }

        if (order.merchant_id) {
            await db.userSession.update({ where: { wa_id: from }, data: { last_merchant_id: order.merchant_id } });
        }

        let msg = `📋 *Order #${order.id.slice(-5)}*\n`;
        msg += `━━━━━━━━━━━━━━━\n`;
        msg += `🏪 ${order.merchant?.trading_name || 'Shop'}\n`;
        msg += `${getStatusEmoji(order.status)} ${formatStatus(order.status)}\n\n`;
        
        msg += `*Items:*\n`;
        order.order_items.forEach(item => {
            msg += `• ${item.quantity}x ${item.product?.name || 'Item'} - ${formatCurrency(item.price, { merchant: order.merchant, merchantBranding: order.merchant?.branding, platform: platformBranding })}\n`;
        });
        
        msg += `\n💰 *Total: ${formatCurrency(order.total, { merchant: order.merchant, merchantBranding: order.merchant?.branding, platform: platformBranding })}*`;

        await sendButtons(from, msg, [
            { id: 'c_my_orders', title: '⬅️ Back' },
            { id: 'browse_shops', title: '🪪 Browse Shops' }
        ]);
        return;
    }

    await sendTextMessage(from, '⚠️ Unknown action.');
};

const getStatusEmoji = (status: string): string => {
    const map: Record<string, string> = {
        'PENDING': '🟡', 'PAID': '🟢', 'READY_FOR_PICKUP': '✅', 'COMPLETED': '🎉', 'CANCELLED': '❌'
    };
    return map[status] || '⚪';
};

const formatStatus = (status: string): string => {
    const map: Record<string, string> = {
        'PENDING': 'Pending', 'PAID': 'Paid', 'READY_FOR_PICKUP': 'Ready for Pickup', 'COMPLETED': 'Completed', 'CANCELLED': 'Cancelled'
    };
    return map[status] || status;
};
