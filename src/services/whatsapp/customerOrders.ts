import { sendTextMessage, sendButtons, sendListMessage } from './sender';
import { formatCurrency } from './messageTemplates';
import { getPlatformBranding } from './platformBranding';
import { createPaymentRequest } from '../payments/ozow';
import { db } from '../../lib/db';
import { Prisma } from '@prisma/client';

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
            await sendButtons(from, '📭 You have no recent orders.\n\nBrowse shops to place your first order!', [
                { id: 'browse_shops', title: '🛍️ Browse Stores' }
            ]);
            return;
        }

        let msg = '📦 *Your Recent Orders*\n\n';
        orders.forEach(o => {
            const emoji = getStatusEmoji(o.status);
            msg += `${emoji} #${o.id.slice(-5)} — ${o.merchant?.trading_name || 'Shop'}\n`;
            msg += `   ${formatCurrency(o.total, { merchant: o.merchant, merchantBranding: o.merchant?.branding, platform: platformBranding })}  •  ${formatStatus(o.status)}\n\n`;
        });

        const buttons = orders.slice(0, 3).map(o => ({
            id: `view_order_${o.id}`,
            title: `#${o.id.slice(-5)} ${getStatusEmoji(o.status)}`
        }));

        await sendButtons(from, msg.trim(), buttons);
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

        const dateStr = order.createdAt.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });

        let msg = `📋 *Order #${order.id.slice(-5)}*\n`;
        msg += `━━━━━━━━━━━━━━━\n`;
        msg += `🏪 ${order.merchant?.trading_name || 'Shop'}\n`;
        msg += `📅 ${dateStr}\n`;
        msg += `${getStatusEmoji(order.status)} ${formatStatus(order.status)}\n\n`;
        msg += `*Items:*\n`;
        order.order_items.forEach(item => {
            msg += `• ${item.quantity}x ${item.product?.name || 'Item'}  —  ${formatCurrency(item.price * item.quantity, { merchant: order.merchant, merchantBranding: order.merchant?.branding, platform: platformBranding })}\n`;
        });
        msg += `\n💰 *Total: ${formatCurrency(order.total, { merchant: order.merchant, merchantBranding: order.merchant?.branding, platform: platformBranding })}*`;

        const actionBtns: Array<{ id: string; title: string }> = [
            { id: 'c_my_orders', title: '⬅️ My Orders' }
        ];

        // Allow pay/delete for pending orders
        if (order.status === 'PENDING') {
            if (order.payment_url) {
                actionBtns.unshift({ id: `retry_payment_${order.id}`, title: '💳 Pay Now' });
            }
            actionBtns.push({ id: `delete_order_${order.id}`, title: '🗑️ Delete Order' });
        }

        await sendButtons(from, msg, actionBtns.slice(0, 3));

        // Optional rating nav bubble — shown below the main order card for completed orders only
        if (order.status === 'COMPLETED') {
            const alreadyRated = await db.auditLog.findFirst({
                where: { action: 'CUSTOMER_FEEDBACK', entity_id: order.id }
            });
            if (!alreadyRated) {
                await sendButtons(from,
                    `⭐ _How was your order from *${order.merchant?.trading_name || 'the store'}*?_`,
                    [{ id: `cfb_start_${order.id}`, title: '⭐ Rate Experience' }]
                );
            }
        }
        return;
    }

    // ── Delete a pending order (customer-initiated) ───────────────────────────
    if (input.startsWith('delete_order_')) {
        const orderId = input.replace('delete_order_', '');
        const order = await db.order.findUnique({ where: { id: orderId } });

        if (!order || order.customer_id !== from) {
            await sendTextMessage(from, '❌ Order not found.');
            return;
        }

        if (order.status !== 'PENDING') {
            await sendButtons(from, `⚠️ Order #${order.id.slice(-5)} cannot be deleted (${formatStatus(order.status)}).`, [
                { id: 'c_my_orders', title: '📦 My Orders' }
            ]);
            return;
        }

        await db.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });

        await sendButtons(from,
            `🗑️ Order *#${order.id.slice(-5)}* has been deleted.`,
            [
                { id: 'browse_shops', title: '🛍️ Browse Stores' },
                { id: 'c_my_orders', title: '📦 My Orders' }
            ]
        );
        return;
    }

    // ── Pay stale order (same as retry_payment) ───────────────────────────────
    if (input.startsWith('pay_stale_')) {
        const orderId = input.replace('pay_stale_', '');
        const platformBranding = await getPlatformBranding(db);
        const order = await db.order.findUnique({
            where: { id: orderId },
            include: { merchant: { include: { branding: true } } }
        });

        if (!order || order.customer_id !== from) {
            await sendTextMessage(from, '❌ Order not found.');
            return;
        }

        if (order.status === 'PAID') {
            await sendTextMessage(from, '✅ This order is already paid!');
            return;
        }

        if (order.status !== 'PENDING') {
            await sendButtons(from, `⚠️ Order #${order.id.slice(-5)} cannot be paid (${formatStatus(order.status)}).`, [
                { id: 'c_my_orders', title: '📦 My Orders' }
            ]);
            return;
        }

        try {
            const { paymentUrl, transactionRef } = await createPaymentRequest({
                orderId:      order.id,
                amount:       order.total,
                merchantName: order.merchant?.trading_name || 'Shop'
            });
            await db.order.update({
                where: { id: order.id },
                data:  { payment_ref: transactionRef, payment_url: paymentUrl, status: 'PENDING' }
            });

            const priceStr = formatCurrency(order.total, { merchant: order.merchant, merchantBranding: order.merchant?.branding, platform: platformBranding });
            await sendButtons(from,
                `💳 *Pay for Order #${order.id.slice(-5)}*\n\n${order.items_summary || 'Your order'}\n💰 ${priceStr}\n\n${paymentUrl}`,
                [
                    { id: `pay_stale_${order.id}`, title: '🔄 New Link' },
                    { id: `delete_order_${order.id}`, title: '🗑️ Delete' }
                ]
            );
        } catch (err: any) {
            console.error(`❌ Pay stale failed: ${err.message}`);
            await sendTextMessage(from, '⚠️ Could not generate payment link. Please try again.');
        }
        return;
    }

    // ── Customer feedback — start (show rating) ───────────────────────────────
    if (input.startsWith('cfb_start_')) {
        const orderId = input.replace('cfb_start_', '');
        const order = await db.order.findUnique({
            where: { id: orderId },
            include: { merchant: true }
        });

        if (!order || order.customer_id !== from) {
            await sendTextMessage(from, '❌ Order not found.');
            return;
        }

        const existing = await db.auditLog.findFirst({ where: { action: 'CUSTOMER_FEEDBACK', entity_id: orderId } });
        if (existing) {
            await sendButtons(from, '✅ You have already left feedback for this order.', [
                { id: `view_order_${orderId}`, title: '📋 View Order' }
            ]);
            return;
        }

        await sendListMessage(
            from,
            `⭐ *Rate your experience with ${order.merchant?.trading_name || 'the store'}*\n\nOrder #${orderId.slice(-5)}`,
            '⭐ Choose Rating',
            [{
                title: 'Rating',
                rows: [
                    { id: `cfb_r5_${orderId}`, title: '⭐⭐⭐⭐⭐  Excellent',   description: 'Couldn\'t be happier!' },
                    { id: `cfb_r4_${orderId}`, title: '⭐⭐⭐⭐  Good',         description: 'Happy overall' },
                    { id: `cfb_r3_${orderId}`, title: '⭐⭐⭐  Average',       description: 'It was okay' },
                    { id: `cfb_r2_${orderId}`, title: '⭐⭐  Below Average',  description: 'Not what I expected' },
                    { id: `cfb_r1_${orderId}`, title: '⭐  Poor',            description: 'Very disappointed' }
                ]
            }]
        );
        return;
    }

    // ── Customer feedback — rating selected ───────────────────────────────────
    if (input.match(/^cfb_r[1-5]_/)) {
        const match = input.match(/^cfb_r([1-5])_(.+)$/);
        if (!match) { await sendTextMessage(from, '⚠️ Invalid rating.'); return; }

        const rating = parseInt(match[1]);
        const orderId = match[2];

        const order = await db.order.findUnique({ where: { id: orderId }, include: { merchant: true } });
        if (!order || order.customer_id !== from) { await sendTextMessage(from, '❌ Order not found.'); return; }

        // Low rating (< 3) — ask for optional comment
        if (rating < 3) {
            await db.userSession.update({
                where: { wa_id: from },
                data: {
                    active_prod_id: `feedback_comment_${orderId}`,
                    state: JSON.stringify({ rating, orderId, merchant_id: order.merchant_id, merchant_name: order.merchant?.trading_name })
                }
            });
            const stars = '⭐'.repeat(rating);
            await sendButtons(from,
                `${stars} *${rating}/5*\n\nSorry to hear that. What could *${order.merchant?.trading_name || 'the store'}* do better? _(optional)_`,
                [{ id: `cfb_skip_comment_${orderId}`, title: '⏩ Skip' }]
            );
            return;
        }

        // High rating (≥ 3) — save immediately, no comment needed
        await saveFeedback(from, orderId, rating, null, null);
        return;
    }

    // ── Customer feedback — skip comment ─────────────────────────────────────
    if (input.startsWith('cfb_skip_comment_')) {
        const orderId = input.replace('cfb_skip_comment_', '');
        const sessionRaw = await db.userSession.findUnique({ where: { wa_id: from }, select: { state: true } });
        const payload = sessionRaw?.state ? JSON.parse(sessionRaw.state) : null;

        await saveFeedback(from, orderId, payload?.rating ?? 0, null, payload);
        return;
    }

    await sendTextMessage(from, '⚠️ Unknown action.');
};

// ── Feedback comment state handler ────────────────────────────────────────────
export const handleFeedbackCommentState = async (from: string, comment: string): Promise<void> => {
    const sessionRaw = await db.userSession.findUnique({ where: { wa_id: from }, select: { active_prod_id: true, state: true } });
    const orderId = sessionRaw?.active_prod_id?.replace('feedback_comment_', '') ?? '';
    const payload = sessionRaw?.state ? JSON.parse(sessionRaw.state) : null;

    await saveFeedback(from, orderId, payload?.rating ?? 0, comment === 'skip' ? null : comment, payload);
};

// ── Save feedback to AuditLog + notify merchant ───────────────────────────────
const saveFeedback = async (
    from: string,
    orderId: string,
    rating: number,
    comment: string | null,
    _payload: Record<string, any> | null
): Promise<void> => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null, state: null } });

    const order = await db.order.findUnique({
        where: { id: orderId },
        include: { merchant: true, order_items: { include: { product: true } } }
    });

    if (!order) { await sendTextMessage(from, '❌ Order not found.'); return; }

    const merchantId = order.merchant_id;
    const merchantName = order.merchant?.trading_name || 'Store';

    await db.auditLog.create({
        data: {
            actor_wa_id: from,
            action: 'CUSTOMER_FEEDBACK',
            entity_type: 'Order',
            entity_id: orderId,
            metadata_json: {
                order_id: orderId,
                merchant_id: merchantId,
                merchant_name: merchantName,
                customer_wa_id: from,
                rating,
                comment: comment ?? null,
                order_total: order.total,
                feedback_submitted_at: new Date().toISOString()
            } as Prisma.InputJsonValue
        }
    });

    const stars = '⭐'.repeat(rating);
    await sendButtons(from,
        `${stars} *Feedback submitted!*\n\nThank you — your review helps ${merchantName} improve. 🙏`,
        [
            { id: `view_order_${orderId}`, title: '📋 View Order' },
            { id: 'c_my_orders', title: '📦 My Orders' }
        ]
    );

    // Notify merchant of low-rating (≤ 2 stars)
    if (rating <= 2 && order.merchant?.wa_id) {
        const stars_display = '⭐'.repeat(rating);
        await sendButtons(
            order.merchant.wa_id,
            `⚠️ *Low Rating on Order #${orderId.slice(-5)}*\n\n${stars_display} ${rating}/5\n${comment ? `"${comment}"` : '(no comment)'}`,
            [{ id: `view_kitchen_${orderId}`, title: '📋 View Order' }, { id: 'm_reviews', title: '⭐ All Reviews' }]
        );
    }
};

export const sendStaleOrderAlertToCustomer = async (orderId: string): Promise<void> => {
    const platformBranding = await getPlatformBranding(db);
    const order = await db.order.findUnique({
        where: { id: orderId },
        include: {
            order_items: { include: { product: true } },
            merchant: { include: { branding: true } }
        }
    });

    if (!order || order.status !== 'PENDING') return;

    const dateStr = order.createdAt.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
    const priceStr = formatCurrency(order.total, { merchant: order.merchant, merchantBranding: order.merchant?.branding, platform: platformBranding });

    const itemLines = order.order_items
        .map(i => `• ${i.quantity}x ${i.product?.name || 'Item'}`)
        .join('\n');

    const msg = [
        `🔔 *Unpaid Order Reminder*`,
        ``,
        `🏪 ${order.merchant?.trading_name || 'Shop'}`,
        `📅 Ordered: ${dateStr}`,
        ``,
        `*Items:*`,
        itemLines,
        ``,
        `💰 *Total: ${priceStr}*`,
        ``,
        `_This order will be cancelled soon if not paid._`
    ].join('\n');

    const payUrl = order.payment_url;

    await sendButtons(order.customer_id, msg, [
        { id: `pay_stale_${order.id}`, title: '💳 Pay Now' },
        { id: `delete_order_${order.id}`, title: '🗑️ Delete Order' }
    ]);

    if (payUrl) {
        await sendTextMessage(order.customer_id, `💳 Payment link:\n${payUrl}`);
    }

    await db.order.update({
        where: { id: orderId },
        data: { customer_alerted_at: new Date() }
    });
};

const getStatusEmoji = (status: string): string => {
    const map: Record<string, string> = {
        'PENDING': '🟡', 'PAID': '🟢', 'READY_FOR_PICKUP': '✅', 'COMPLETED': '🎉', 'CANCELLED': '❌', 'ABANDONED': '🚫'
    };
    return map[status] || '⚪';
};

const formatStatus = (status: string): string => {
    const map: Record<string, string> = {
        'PENDING': 'Awaiting Payment', 'PAID': 'Paid', 'READY_FOR_PICKUP': 'Ready for Pickup',
        'COMPLETED': 'Completed', 'CANCELLED': 'Cancelled'
    };
    return map[status] || status;
};
