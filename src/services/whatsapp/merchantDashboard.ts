import { PrismaClient, Merchant } from '@prisma/client';
import { sendButtons, sendTextMessage } from './sender';
import { getBrandingForMerchant } from './branding';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export const showMerchantDashboard = async (to: string, merchant: Merchant): Promise<void> => {
    try {
        // Clear any active state
        await db.userSession.update({ 
            where: { wa_id: to }, 
            data: { active_prod_id: null } 
        });
        
        const status = merchant.manual_closed ? '🔴 CLOSED' : '🟢 OPEN';
        const branding = await getBrandingForMerchant(merchant.id);
        
        // Get pending orders count
        const pendingCount = await db.order.count({
            where: { 
                merchant_id: merchant.id, 
                status: { in: ['PENDING', 'PAID'] } 
            }
        });

        let msg = `🏪 *${merchant.trading_name}*\n`;
        msg += `📍 Status: ${status}\n`;
        
        if (pendingCount > 0) {
            msg += `\n🔔 *${pendingCount} order${pendingCount > 1 ? 's' : ''} waiting!*\n`;
        }
        
        msg += '\nManage your store below.';

        if (branding.supportNumber) {
            msg += `\n📞 Support: ${branding.supportNumber}`;
        }

        const kitchenTitle = pendingCount > 0 ? `🍳 Kitchen (${pendingCount})` : '🍳 Kitchen';

        await sendButtons(to, msg, [
            { id: 'm_kitchen', title: kitchenTitle.substring(0, 20) },
            { id: 'm_inventory', title: '📦 My Menu' },
            { id: 'm_settings', title: '🛠️ Settings' }
        ]);

    } catch (error: any) {
        console.error(`❌ Dashboard Error: ${error.message}`);
        await sendTextMessage(to, '⚠️ Error loading dashboard.');
    }
};
