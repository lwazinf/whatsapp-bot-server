import { OrderStatus } from '@prisma/client';
import { sendButtons, sendTextMessage } from '../whatsapp/sender';
import { formatCurrency } from '../whatsapp/messageTemplates';
import { getPlatformBranding } from '../whatsapp/platformBranding';
import { sendStaleOrderAlertToCustomer } from '../whatsapp/customerOrders';
import { db } from '../../lib/db';

// Thresholds
const MERCHANT_ALERT_MINUTES = 10;   // alert merchant after 10 min
const MERCHANT_MAX_ALERTS = 2;
const CUSTOMER_ALERT_MINUTES = 60;   // alert customer after 60 min
const ABANDON_MINUTES = 75;          // auto-cancel after 75 min if still unpaid

export const checkStaleOrders = async (): Promise<void> => {
    try {
        const now = Date.now();
        const merchantThreshold = new Date(now - MERCHANT_ALERT_MINUTES * 60 * 1000);
        const customerThreshold = new Date(now - CUSTOMER_ALERT_MINUTES * 60 * 1000);
        const abandonThreshold  = new Date(now - ABANDON_MINUTES * 60 * 1000);

        const platformBranding = await getPlatformBranding(db);

        // ── Auto-cancel orders older than ABANDON_MINUTES ─────────────────────
        const toAbandon = await db.order.findMany({
            where: {
                status: OrderStatus.PENDING,
                createdAt: { lt: abandonThreshold }
            },
            include: { merchant: { include: { branding: true } } }
        });

        for (const order of toAbandon) {
            await db.order.update({
                where: { id: order.id },
                data:  { status: OrderStatus.CANCELLED }
            });
            console.log(`🚫 Order #${order.id.slice(-5)} auto-cancelled (unpaid after ${ABANDON_MINUTES}m)`);

            // Notify customer
            await sendTextMessage(
                order.customer_id,
                `🚫 *Order #${order.id.slice(-5)} Cancelled*\n\n` +
                `Your unpaid order at *${order.merchant?.trading_name || 'the shop'}* was automatically cancelled.\n\n` +
                `You can place a new order anytime! 🛍️`
            );
        }

        if (toAbandon.length > 0) {
            console.log(`🚫 Auto-cancelled ${toAbandon.length} abandoned order(s)`);
        }

        // ── Alert customers for orders 60+ min old ────────────────────────────
        const forCustomerAlert = await db.order.findMany({
            where: {
                status: OrderStatus.PENDING,
                createdAt: { lt: customerThreshold, gte: abandonThreshold },
                customer_alerted_at: null
            }
        });

        for (const order of forCustomerAlert) {
            try {
                await sendStaleOrderAlertToCustomer(order.id);
                console.log(`🔔 Customer alerted for order #${order.id.slice(-5)}`);
            } catch (err: any) {
                console.error(`❌ Customer alert failed for ${order.id}: ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        // ── Alert merchants for orders 10+ min old ────────────────────────────
        const forMerchantAlert = await db.order.findMany({
            where: {
                status: { in: [OrderStatus.PENDING, OrderStatus.PAID] },
                createdAt: { lt: merchantThreshold },
                alert_count: { lt: MERCHANT_MAX_ALERTS }
            },
            include: { merchant: { include: { branding: true } } }
        });

        if (forMerchantAlert.length === 0 && forCustomerAlert.length === 0 && toAbandon.length === 0) {
            console.log('📭 No stale orders');
            return;
        }

        console.log(`📋 Merchant alerts: ${forMerchantAlert.length}`);

        for (const order of forMerchantAlert) {
            if (!order.merchant?.wa_id) continue;

            const mins = Math.floor((now - order.createdAt.getTime()) / 60000);
            const alertNum = (order.alert_count || 0) + 1;

            await sendButtons(
                order.merchant.wa_id,
                `🔔 *Order Alert*\n\n📦 #${order.id.slice(-5)}\n⏱️ ${mins}m waiting\n💰 ${formatCurrency(order.total, { merchant: order.merchant, merchantBranding: order.merchant.branding, platform: platformBranding })}\n\n_Alert ${alertNum}/${MERCHANT_MAX_ALERTS}_`,
                [
                    { id: `view_kitchen_${order.id}`, title: '👨‍🍳 View' },
                    { id: `ready_${order.id}`, title: '✅ Ready' }
                ]
            );

            await db.order.update({
                where: { id: order.id },
                data:  { alert_count: { increment: 1 } }
            });

            await new Promise(r => setTimeout(r, 500));
        }

    } catch (error: any) {
        console.error('❌ Stale order check error:', error.message);
        throw error;
    }
};
