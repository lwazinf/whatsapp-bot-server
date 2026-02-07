import { PrismaClient } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';
import { formatCurrency, formatOrderStatus, getLocaleTemplates } from './formatters';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export const handleCustomerOrders = async (from: string, input: string): Promise<void> => {
    if (input === 'c_my_orders') {
        const orders = await db.order.findMany({
            where: { customer_id: from },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { merchant: true }
        });

        if (orders.length === 0) {
            await sendTextMessage(from, '📭 You have no recent orders.\n\nBrowse shops to place your first order!');
            return;
        }

        let msg = '📦 *Your Recent Orders*\n\n';
        orders.forEach(o => {
            const emoji = getStatusEmoji(o.status);
            msg += `${emoji} #${o.id.slice(-5)} - ${formatCurrency(o.total, o.merchant)}\n`;
            msg += `   ${o.merchant?.trading_name || 'Shop'} • ${formatOrderStatus(o.status, o.merchant?.locale)}\n\n`;
        });

        const buttons = orders.slice(0, 3).map(o => ({
            id: `view_order_${o.id}`,
            title: `#${o.id.slice(-5)}`
        }));

        await sendButtons(from, msg, buttons);
        return;
    }

    if (input.startsWith('view_order_')) {
        const orderId = input.replace('view_order_', '');
        
        const order = await db.order.findUnique({
            where: { id: orderId },
            include: {
                order_items: { include: { product: true } },
                merchant: true
            }
        });

        if (!order || order.customer_id !== from) {
            await sendTextMessage(from, '❌ Order not found.');
            return;
        }

        const templates = getLocaleTemplates(order.merchant?.locale);
        let msg = `📋 *${templates.orderLabel} #${order.id.slice(-5)}*\n`;
        msg += `━━━━━━━━━━━━━━━\n`;
        msg += `🏪 ${order.merchant?.trading_name || 'Shop'}\n`;
        msg += `${getStatusEmoji(order.status)} ${formatOrderStatus(order.status, order.merchant?.locale)}\n\n`;
        
        msg += `*${templates.itemsLabel}:*\n`;
        order.order_items.forEach(item => {
            msg += `• ${item.quantity}x ${item.product?.name || 'Item'} - ${formatCurrency(item.price, order.merchant)}\n`;
        });
        
        msg += `\n💰 *${templates.totalLabel}: ${formatCurrency(order.total, order.merchant)}*`;

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
