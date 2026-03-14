import { OrderStatus, Merchant, UserSession } from '@prisma/client';
import { sendTextMessage, sendButtons, sendListMessage } from './sender';
import { formatCurrency } from './messageTemplates';
import { getPlatformBranding, getPlatformSettings } from './platformBranding';
import { db } from '../../lib/db';

const ADMIN_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER;

export const handleKitchenActions = async (
    from: string, 
    input: string, 
    session: UserSession, 
    merchant: Merchant
): Promise<void> => {
    try {
        const platformBranding = await getPlatformBranding(db);
        const platformSettings = await getPlatformSettings(db);
        const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: merchant.id } });
        // Kitchen Menu
        if (input === 'm_kitchen') {
            const [newCount, readyCount, reviewCount] = await Promise.all([
                db.order.count({ where: { merchant_id: merchant.id, status: { in: ['PENDING', 'PAID'] } } }),
                db.order.count({ where: { merchant_id: merchant.id, status: 'READY_FOR_PICKUP' } }),
                db.auditLog.count({ where: { action: 'CUSTOMER_FEEDBACK', metadata_json: { path: ['merchant_id'], equals: merchant.id } } })
            ]);

            await sendButtons(from,
                `🍳 *Kitchen*\n\n📊 New: ${newCount} | Ready: ${readyCount}`,
                [
                    { id: 'k_new', title: newCount > 0 ? `🔥 New (${newCount})` : '📥 New Orders' },
                    { id: 'k_ready', title: readyCount > 0 ? `✅ Ready (${readyCount})` : '✅ Ready' },
                    { id: 'm_dashboard', title: '🏠 Dashboard' }
                ]
            );
            await sendButtons(from, '⭐ Customer Reviews:', [
                { id: 'm_reviews', title: reviewCount > 0 ? `⭐ Reviews (${reviewCount})` : '⭐ Reviews' }
            ]);
            return;
        }

        // ── Customer reviews ──────────────────────────────────────────────────
        if (input === 'm_reviews' || input.startsWith('m_reviews_p')) {
            const page = input === 'm_reviews' ? 1 : (parseInt(input.replace('m_reviews_p', ''), 10) || 1);
            const PAGE_SIZE = 5;
            const skip = (page - 1) * PAGE_SIZE;

            const [items, total] = await Promise.all([
                db.auditLog.findMany({
                    where: { action: 'CUSTOMER_FEEDBACK', metadata_json: { path: ['merchant_id'], equals: merchant.id } },
                    orderBy: { createdAt: 'desc' },
                    take: PAGE_SIZE,
                    skip
                }),
                db.auditLog.count({ where: { action: 'CUSTOMER_FEEDBACK', metadata_json: { path: ['merchant_id'], equals: merchant.id } } })
            ]);

            if (total === 0) {
                await sendButtons(from, '📭 No customer reviews yet.', [{ id: 'm_kitchen', title: '🍳 Kitchen' }]);
                return;
            }

            const totalPages = Math.ceil(total / PAGE_SIZE);
            let msg = `⭐ *Customer Reviews* (${total} total)\n━━━━━━━━━━━━━━━━━━━━\n`;

            for (const item of items) {
                const meta = item.metadata_json as any;
                const stars = '⭐'.repeat(meta?.rating ?? 0);
                const comment = meta?.comment ? `\n"${meta.comment}"` : '';
                const date = item.createdAt.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
                msg += `\n${stars} (${date})${comment}\n`;
            }

            const navBtns: Array<{ id: string; title: string }> = [];
            if (page > 1) navBtns.push({ id: `m_reviews_p${page - 1}`, title: '◀ Prev' });
            if (page < totalPages) navBtns.push({ id: `m_reviews_p${page + 1}`, title: 'Next ▶' });
            navBtns.push({ id: 'm_kitchen', title: '🍳 Kitchen' });

            await sendButtons(from, msg, navBtns.slice(0, 3));
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
                    title: `#${o.id.slice(-5)} • ${formatCurrency(o.total, { merchant, merchantBranding, platform: platformBranding })}`,
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

            let msg = `📋 *Order #${order.id.slice(-5)}*\n━━━━━━━━━━━━\n`;
            order.order_items.forEach(i => {
                msg += `• ${i.quantity}x ${i.product?.name || 'Item'}\n`;
            });
            msg += `\n💰 ${formatCurrency(order.total, { merchant, merchantBranding, platform: platformBranding })}`;

            await sendButtons(from, msg, [
                { id: `ready_${order.id}`, title: '✅ Mark Ready' },
                { id: `cancel_order_${order.id}`, title: '❌ Cancel Order' },
                { id: 'k_new', title: '⬅️ Back' }
            ]);
            return;
        }

        // Cancel order — confirmation prompt
        if (input.startsWith('cancel_order_')) {
            const oid = input.replace('cancel_order_', '');
            const order = await db.order.findUnique({ where: { id: oid } });

            if (!order || order.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Order not found.');
                return;
            }
            if (order.status === 'CANCELLED' || order.status === 'COMPLETED') {
                await sendTextMessage(from, `⚠️ Order #${order.id.slice(-5)} is already ${order.status.toLowerCase()}.`);
                return;
            }

            await sendButtons(from,
                `❌ *Cancel Order #${order.id.slice(-5)}?*\n\nThe customer will be notified. This cannot be undone.`,
                [
                    { id: `confirm_cancel_${order.id}`, title: '✅ Yes, Cancel' },
                    { id: `abort_cancel_${order.id}`, title: '↩️ No, Go Back' }
                ]
            );
            return;
        }

        // Abort cancellation — return to order detail
        if (input.startsWith('abort_cancel_')) {
            const oid = input.replace('abort_cancel_', '');
            await handleKitchenActions(from, `k_view_${oid}`, session, merchant);
            return;
        }

        // Confirm cancellation
        if (input.startsWith('confirm_cancel_')) {
            const oid = input.replace('confirm_cancel_', '');
            const order = await db.order.findUnique({ where: { id: oid } });

            if (!order || order.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Order not found.');
                return;
            }

            await db.order.update({ where: { id: oid }, data: { status: OrderStatus.CANCELLED } });

            // Notify customer
            await sendTextMessage(
                order.customer_id,
                `❌ *Order #${order.id.slice(-5)} Cancelled*\n\nYour order from *${merchant.trading_name}* has been cancelled.\n\nContact the shop if this is an error.`
            );

            await sendTextMessage(from, `✅ Order #${order.id.slice(-5)} cancelled. Customer notified.`);
            await handleKitchenActions(from, 'k_new', session, merchant);
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
                description: formatCurrency(o.total, { merchant, merchantBranding, platform: platformBranding })
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
                `🛎️ *Order Ready!*\n\nYour order from *${merchant.trading_name}* is ready!\n\n📦 #${order.id.slice(-5)}\n📍 ${merchant.address || 'See store for pickup'}`
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

            // Notify customer + prompt for rating
            await sendTextMessage(order.customer_id, `🎉 *Order Complete!*\n\nThank you for ordering from *${merchant.trading_name}*!`);
            await sendButtons(order.customer_id,
                `⭐ _How was your experience? Rate your order from *${merchant.trading_name}* — it only takes a second._`,
                [{ id: `cfb_start_${oid}`, title: '⭐ Rate Experience' }]
            );

            // Log fee to admin
            const fee = order.total * platformSettings.platformFee;
            if (ADMIN_NUMBER) {
                await sendTextMessage(ADMIN_NUMBER,
                    `💰 *Order Complete*\n\n🏪 ${merchant.trading_name}\n📦 #${order.id.slice(-5)}\n💵 ${formatCurrency(order.total, { merchant, merchantBranding, platform: platformBranding })}\n📊 Fee: ${formatCurrency(fee, { merchant, merchantBranding, platform: platformBranding })}`
                );
            }

            await sendTextMessage(
                from,
                `🎉 #${order.id.slice(-5)} completed!\n\n💵 ${formatCurrency(order.total, { merchant, merchantBranding, platform: platformBranding })}\n💰 Earnings: ${formatCurrency(order.total - fee, { merchant, merchantBranding, platform: platformBranding })}`
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
