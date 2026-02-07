import { PrismaClient, OrderStatus, Merchant, UserSession } from '@prisma/client';
import { sendTextMessage, sendButtons, sendListMessage } from './sender';
import { formatCurrency, getLocaleTemplates } from './formatters';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

const ADMIN_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER || '27746854339';
const PLATFORM_FEE = 0.07;

export const handleKitchenActions = async (
    from: string, 
    input: string, 
    session: UserSession, 
    merchant: Merchant
): Promise<void> => {
    try {
        const templates = getLocaleTemplates(merchant.locale);
        // Kitchen Menu
        if (input === 'm_kitchen') {
            const [newCount, readyCount] = await Promise.all([
                db.order.count({ where: { merchant_id: merchant.id, status: { in: ['PENDING', 'PAID'] } } }),
                db.order.count({ where: { merchant_id: merchant.id, status: 'READY_FOR_PICKUP' } })
            ]);

            await sendButtons(from, 
                `🍳 *Kitchen*\n\n📊 New: ${newCount} | Ready: ${readyCount}`,
                [
                    { id: 'k_new', title: newCount > 0 ? `🔥 New (${newCount})` : '📥 New Orders' },
                    { id: 'k_ready', title: readyCount > 0 ? `✅ Ready (${readyCount})` : '✅ Ready' },
                    { id: 'm_dashboard', title: '🏠 Dashboard' }
                ]
            );
            return;
        }

        // View New Orders
        if (input === 'k_new') {
            const orders = await db.order.findMany({
                where: { merchant_id: merchant.id, status: { in: ['PENDING', 'PAID'] } },
                orderBy: { createdAt: 'asc' },
                take: 10,
                include: { order_items: { include: { product: true } } }
            });

            if (orders.length === 0) {
                await sendTextMessage(from, '📭 No new orders.');
                await handleKitchenActions(from, 'm_kitchen', session, merchant);
                return;
            }

            const rows = orders.map(o => {
                const mins = Math.floor((Date.now() - o.createdAt.getTime()) / 60000);
                return {
                    id: `k_view_${o.id}`,
                    title: `#${o.id.slice(-5)} • ${formatCurrency(o.total, merchant)}`,
                    description: `${mins}m waiting`
                };
            });

            await sendListMessage(from, `🔥 *New Orders* (${orders.length})`, '📋 View', [{ title: 'Orders', rows }]);
            await sendButtons(from, 'Nav:', [{ id: 'm_kitchen', title: '⬅️ Back' }]);
            return;
        }

        // View order detail
        if (input.startsWith('k_view_')) {
            const oid = input.replace('k_view_', '');
            const order = await db.order.findUnique({
                where: { id: oid },
                include: { order_items: { include: { product: true } } }
            });

            if (!order || order.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Order not found.');
                return;
            }

            let msg = `📋 *${templates.orderLabel} #${order.id.slice(-5)}*\n━━━━━━━━━━━━\n`;
            order.order_items.forEach(i => {
                msg += `• ${i.quantity}x ${i.product?.name || 'Item'}\n`;
            });
            msg += `\n💰 ${templates.totalLabel}: ${formatCurrency(order.total, merchant)}`;

            await sendButtons(from, msg, [
                { id: `ready_${order.id}`, title: '✅ Mark Ready' },
                { id: 'k_new', title: '⬅️ Back' }
            ]);
            return;
        }

        // View Ready Orders
        if (input === 'k_ready') {
            const orders = await db.order.findMany({
                where: { merchant_id: merchant.id, status: 'READY_FOR_PICKUP' },
                orderBy: { updatedAt: 'asc' },
                take: 10
            });

            if (orders.length === 0) {
                await sendTextMessage(from, '📭 No orders waiting for pickup.');
                await handleKitchenActions(from, 'm_kitchen', session, merchant);
                return;
            }

            const rows = orders.map(o => ({
                id: `collected_${o.id}`,
                title: `#${o.id.slice(-5)} • Collect`,
                description: formatCurrency(o.total, merchant)
            }));

            await sendListMessage(from, `✅ *Ready for Pickup* (${orders.length})`, '📋 View', [{ title: 'Orders', rows }]);
            await sendButtons(from, 'Nav:', [{ id: 'm_kitchen', title: '⬅️ Back' }]);
            return;
        }

        // Mark Ready
        if (input.startsWith('ready_')) {
            const oid = input.replace('ready_', '');
            const order = await db.order.findUnique({ where: { id: oid } });

            if (!order || order.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Order not found.');
                return;
            }

            await db.order.update({ where: { id: oid }, data: { status: OrderStatus.READY_FOR_PICKUP } });

            // Notify customer
            await sendTextMessage(order.customer_id, 
                `🛎️ *${templates.orderReadyTitle}*\n\n${templates.orderReadyBody(merchant.trading_name)}\n\n📦 #${order.id.slice(-5)}\n📍 ${merchant.address || 'See store for pickup'}`
            );

            await sendTextMessage(from, '✅ Marked ready. Customer notified!');
            await handleKitchenActions(from, 'k_new', session, merchant);
            return;
        }

        // Mark Collected
        if (input.startsWith('collected_')) {
            const oid = input.replace('collected_', '');
            const order = await db.order.findUnique({ where: { id: oid } });

            if (!order || order.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Order not found.');
                return;
            }

            await db.order.update({ where: { id: oid }, data: { status: OrderStatus.COMPLETED } });

            // Notify customer
            await sendTextMessage(
                order.customer_id,
                `🎉 *${templates.orderCompleteTitle}*\n\n${templates.orderCompleteThanks(merchant.trading_name)}`
            );

            // Log fee to admin
            const fee = order.total * PLATFORM_FEE;
            await sendTextMessage(ADMIN_NUMBER, 
                `💰 *${templates.orderCompleteTitle}*\n\n🏪 ${merchant.trading_name}\n📦 #${order.id.slice(-5)}\n💵 ${formatCurrency(order.total, merchant)}\n📊 ${templates.feeLabel}: ${formatCurrency(fee, merchant)}`
            );

            await sendTextMessage(
                from,
                `🎉 #${order.id.slice(-5)} completed!\n\n💵 ${formatCurrency(order.total, merchant)}\n💰 ${templates.earningsLabel}: ${formatCurrency(order.total - fee, merchant)}`
            );
            await handleKitchenActions(from, 'k_ready', session, merchant);
            return;
        }

        // Fallback
        await handleKitchenActions(from, 'm_kitchen', session, merchant);

    } catch (error: any) {
        console.error(`❌ Kitchen Error: ${error.message}`);
        await sendTextMessage(from, '❌ Error occurred.');
    }
};
