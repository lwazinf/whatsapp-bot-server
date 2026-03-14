import { Merchant, UserSession } from '@prisma/client';
import { handleInventoryActions } from './merchantInventory';
import { handleKitchenActions } from './merchantKitchen';
import { handleSettingsActions } from './merchantSettings';
import { getMerchantStats, showMerchantDashboard } from './merchantDashboard';
import { handleBroadcastActions } from './merchantBroadcast';
import { sendButtons, sendTextMessage } from './sender';
import { formatCurrency } from './messageTemplates';
import { getPlatformBranding } from './platformBranding';
import { db } from '../../lib/db';

const INVENTORY_PREFIXES = [
    'm_inventory',
    'm_categories',
    'cat_add',
    'cat_',
    'select_cat_',
    'edit_category_',
    'p_',
    'm_add_',
    'conf_',
    'toggle_',
    'delete_prod_',
    'edit_prod_',
    'skip_image',
    'cancel_delete',
    'confirm_del_',
    'view_variants_',
    'add_variant_',
    'edit_variant_',
    'variant_field_',
    'variant_delete_',
    'm_archived',
    'arch_',
    'prod_edit_',
    'prod_clear_img_',
    'cancel_prod_img',
    'p_view_all_p'
];
const KITCHEN_PREFIXES = ['m_kitchen', 'k_', 'ready_', 'collected_', 'view_kitchen_', 'cancel_order_', 'confirm_cancel_', 'abort_cancel_', 'm_reviews', 'm_reviews_p'];
const SETTINGS_PREFIXES = ['m_settings', 's_', 'h_', 'm_edit_hours', 'ob_hours', 's_browse_toggle', 's_welcome_img', 's_clear_welcome_img', 'mcat_'];
const BROADCAST_PREFIXES = ['m_broadcast', 'b_'];

export const handleMerchantAction = async (
    from: string, 
    input: string, 
    session: UserSession, 
    merchant: Merchant, 
    message?: any
): Promise<void> => {
    try {
        const platformBranding = await getPlatformBranding(db);
        const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: merchant.id } });
        // Going-live disclaimer acceptance (end of onboarding)
        if (input.startsWith('ob_golive_accept_')) {
            const activatedMerchant = await db.merchant.update({
                where: { id: merchant.id },
                data: { status: 'ACTIVE' }
            });
            await sendButtons(from,
                `🎉 *${activatedMerchant.trading_name} is now LIVE!*\n\n` +
                `Customers can find you at *@${activatedMerchant.handle}*.\n\n` +
                `Welcome to Omeru! 🛍️`,
                [
                    { id: 'm_inventory', title: '📦 My Products' },
                    { id: 'm_dashboard', title: '🏪 Dashboard' }
                ]
            );
            return;
        }

        // Quick open/close toggle from dashboard
        if (input === 'dash_toggle') {
            const updated = await db.merchant.update({
                where: { id: merchant.id },
                data: { manual_closed: !merchant.manual_closed }
            });
            await sendTextMessage(from, `🚦 Shop is now ${updated.manual_closed ? '*CLOSED* 🔴' : '*OPEN* 🟢'}`);
            await showMerchantDashboard(from, updated);
            return;
        }

        // Dashboard
        if (input === 'm_dashboard' || input.toLowerCase() === 'menu' || input.toLowerCase() === 'home') {
            await showMerchantDashboard(from, merchant);
            return;
        }

        // Feedback to platform admin
        if (input === 'm_feedback') {
            await db.userSession.update({
                where: { wa_id: from },
                data: { active_prod_id: 'MERCHANT_FEEDBACK_MSG', state: null }
            });
            await sendTextMessage(from,
                `💬 *Send Feedback to Platform*\n\n` +
                `Type your message below. It will be sent directly to the platform admin.\n\n` +
                `_Type "Omeru" to cancel._`
            );
            return;
        }

        // Capture feedback text
        if (session.active_prod_id === 'MERCHANT_FEEDBACK_MSG') {
            await db.auditLog.create({
                data: {
                    actor_wa_id: from,
                    action: 'MERCHANT_FEEDBACK',
                    entity_type: 'merchant',
                    entity_id: merchant.id,
                    metadata_json: { message: input, merchant_name: merchant.trading_name }
                }
            });
            await db.userSession.update({
                where: { wa_id: from },
                data: { active_prod_id: null, state: null }
            });
            await sendButtons(from,
                `✅ *Feedback sent!*\n\nThank you — the platform team will review your message.`,
                [{ id: 'm_dashboard', title: '🏠 Dashboard' }]
            );
            return;
        }

        if (input === 'm_stats') {
            const stats = await getMerchantStats(merchant.id);
            let summary = `📊 *${merchant.trading_name} Stats*\n\n`;
            summary += `💰 Total Sales: ${formatCurrency(stats.salesTotal, { merchant, merchantBranding, platform: platformBranding })}\n`;
            summary += `🔔 Pending Orders: ${stats.pendingOrders}\n`;
            summary += `✅ Active Products: ${stats.activeProducts}\n`;
            summary += `🗄️ Archived Products: ${stats.archivedProducts}\n`;

            if (stats.recentOrders.length > 0) {
                summary += `\n🧾 Recent Orders:\n`;
                stats.recentOrders.forEach(order => {
                    summary += `• #${order.id.slice(-5)} • ${formatCurrency(order.total, { merchant, merchantBranding, platform: platformBranding })} • ${order.status}\n`;
                });
            } else {
                summary += `\n🧾 Recent Orders:\n• None yet`;
            }

            await sendTextMessage(from, summary);
            await sendButtons(from, 'Actions:', [
                { id: 'm_dashboard', title: '🏠 Dashboard' },
                { id: 'm_kitchen', title: '🍳 Kitchen' }
            ]);
            return;
        }

        // Stale order shortcut from cron alerts
        if (input.startsWith('view_kitchen_')) {
            const orderId = input.replace('view_kitchen_', '');
            const order = await db.order.findUnique({
                where: { id: orderId },
                include: { order_items: { include: { product: true } } }
            });

            if (!order || order.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Order not found.');
                return;
            }

            let summary = `📋 *Order #${order.id.slice(-5)}*\n\n`;
            order.order_items.forEach(item => {
                summary += `• ${item.quantity}x ${item.product?.name || 'Item'}\n`;
            });
            summary += `\n💰 Total: ${formatCurrency(order.total, { merchant, merchantBranding, platform: platformBranding })}`;

            await sendButtons(from, summary, [
                { id: `ready_${order.id}`, title: '✅ Mark Ready' },
                { id: 'm_kitchen', title: '🍳 Kitchen' }
            ]);
            return;
        }

        // Route to sub-modules
        if (matchesPrefix(input, INVENTORY_PREFIXES)) {
            await handleInventoryActions(from, input, session, merchant, message);
            return;
        }

        if (matchesPrefix(input, KITCHEN_PREFIXES)) {
            await handleKitchenActions(from, input, session, merchant);
            return;
        }

        if (matchesPrefix(input, SETTINGS_PREFIXES)) {
            await handleSettingsActions(from, input, session, merchant, message);
            return;
        }

        if (matchesPrefix(input, BROADCAST_PREFIXES)) {
            await handleBroadcastActions(from, input, session, merchant);
            return;
        }

        // Check for active flow state
        if (session.active_prod_id === 'BROADCAST_MESSAGE') {
            await handleBroadcastActions(from, input, session, merchant);
            return;
        }

        if (session.active_prod_id) {
            await handleInventoryActions(from, input, session, merchant, message);
            return;
        }

        // Default to dashboard
        await showMerchantDashboard(from, merchant);

    } catch (error: any) {
        console.error(`❌ Merchant Engine Error: ${error.message}`);
        await sendTextMessage(from, '⚠️ Something went wrong.');
        await showMerchantDashboard(from, merchant);
    }
};

const matchesPrefix = (input: string, prefixes: string[]): boolean => {
    return prefixes.some(p => input === p || input.startsWith(p));
};
