import { PrismaClient, Merchant, UserSession } from '@prisma/client';
import { handleInventoryActions } from './merchantInventory';
import { handleKitchenActions } from './merchantKitchen';
import { handleBroadcastActions } from './merchantBroadcast';
import { handleSettingsActions } from './merchantSettings';
import { showMerchantDashboard } from './merchantDashboard';
import { sendButtons, sendTextMessage } from './sender';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

const INVENTORY_PREFIXES = ['m_inventory', 'p_', 'm_add_', 'conf_', 'toggle_', 'delete_prod_', 'edit_prod_', 'skip_image', 'cancel_delete', 'confirm_del_'];
const KITCHEN_PREFIXES = ['m_kitchen', 'k_', 'ready_', 'collected_', 'view_kitchen_'];
const SETTINGS_PREFIXES = ['m_settings', 's_', 'h_', 'm_edit_hours', 'ob_hours'];
const BROADCAST_PREFIXES = ['m_broadcast', 'b_'];

export const handleMerchantAction = async (
    from: string, 
    input: string, 
    session: UserSession, 
    merchant: Merchant, 
    message?: any
): Promise<void> => {
    try {
        // Dashboard
        if (input === 'm_dashboard' || input.toLowerCase() === 'menu' || input.toLowerCase() === 'home') {
            await showMerchantDashboard(from, merchant);
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
            summary += `\n💰 Total: R${order.total.toFixed(2)}`;

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
        if (session.active_prod_id) {
            if (session.active_prod_id.startsWith('BROADCAST_')) {
                await handleBroadcastActions(from, input, session, merchant);
                return;
            }
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
