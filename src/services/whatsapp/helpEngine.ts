import { MerchantStatus } from '@prisma/client';
import { sendTextMessage } from './sender';
import { db } from '../../lib/db';

const ADMIN_NUMBERS = (): string[] => {
    const raw = process.env.PLATFORM_ADMIN_NUMBERS || process.env.ADMIN_WHATSAPP_NUMBER || '';
    return raw.split(',').map(v => v.trim().replace(/[^\d]/g, '')).filter(Boolean);
};

const isPlatformAdmin = (waId: string) => ADMIN_NUMBERS().includes(waId.replace(/[^\d]/g, ''));

const CUSTOMER_HELP = `📖 *Customer Commands*

🏪 *Browsing*
• *hi* — Welcome menu
• *browse_shops* — List all shops
• *@shopname* — Open a specific shop

📦 *Orders*
• *c_my_orders* — Your 5 recent orders

🔇 *Opt-Out*
• *stop* / *unsubscribe* / *opt-out* — Stop marketing from last visited shop

🔄 *Mode*
• *SwitchOmeru* — Switch profile / mode
• *cancel* — Cancel any current step`;

const MERCHANT_HELP = (storeName: string) => `🏪 *Merchant Commands — ${storeName}*

📊 *Dashboard*
• *menu* / *home* — Dashboard
• *m_stats* — Sales & order stats

🍳 *Kitchen (Orders)*
• *m_kitchen* — Kitchen overview
• *k_new* — Pending/paid orders
• *k_ready* — Ready for pickup

📦 *Products*
• *m_inventory* — Menu manager
• *p_view_all* — View all active products
• *m_add_prod* — Add a new product
• *m_categories* — Manage categories
• *m_archived* — View archived products

🛠️ *Settings*
• *m_settings* — Settings menu
• *s_profile* — Edit profile (bio, logo, welcome image, address, etc.)
• *s_hours* — Trading hours
• *s_toggle* — Toggle shop open / closed

📣 *Broadcast*
• *m_broadcast* — Send message to all opted-in customers

👥 *Team*
• *s_owners* (via s_profile) — View, invite, or remove co-admins`;

const ADMIN_HELP = `🛡️ *Platform Admin Commands*

📋 *Menu*
• *admin* / *pa_menu* — Open admin panel

🏪 *Stores*
• *pa_stores* — View all stores (active / onboarding / suspended)
• _(tap a store to suspend/unsuspend or view admins)_

➕ *Invites*
• *pa_invite* — Invite a new store owner
• *pa_invite_history* — View all invites (accepted / revoked / pending)

🗑️ *Revoke*
• *pa_revoke* — Revoke full owner access from a store
• *pa_revoke_admin* — Remove a specific admin from a store

💡 *Tip:* If a new contact doesn't receive the WhatsApp invite, share the JOIN code shown after sending the invite.`;

export const handleHelpCommand = async (from: string): Promise<void> => {
    const session = await db.userSession.findUnique({ where: { wa_id: from } });
    const isAdmin = isPlatformAdmin(from);

    // Find merchant(s) this user manages
    const directMerchant = await db.merchant.findUnique({ where: { wa_id: from } });
    const ownerRecords = await db.merchantOwner.findMany({
        where: { wa_id: from, is_active: true },
        include: { merchant: true }
    });

    const stores: string[] = [];
    if (directMerchant && directMerchant.status === MerchantStatus.ACTIVE) {
        stores.push(directMerchant.trading_name);
    }
    for (const rec of ownerRecords) {
        if (rec.merchant.status === MerchantStatus.ACTIVE && !stores.includes(rec.merchant.trading_name)) {
            stores.push(rec.merchant.trading_name);
        }
    }

    const isMerchant = stores.length > 0;
    const currentMode = session?.mode || 'CUSTOMER';

    // Always show customer commands
    await sendTextMessage(from, CUSTOMER_HELP);

    // Show merchant commands if they manage any store
    if (isMerchant) {
        const storeName = stores.length === 1 ? stores[0] : stores.join(' / ');
        await sendTextMessage(from, MERCHANT_HELP(storeName));
    }

    // Show admin commands if platform admin
    if (isAdmin) {
        await sendTextMessage(from, ADMIN_HELP);
    }

    // Footer note
    const modeNote = isAdmin
        ? `\n_You are currently in *${currentMode}* mode. Type *SwitchOmeru* to switch._`
        : isMerchant
        ? `\n_You are in *${currentMode}* mode. Type *SwitchOmeru* to switch between Customer and Merchant._`
        : '';

    if (modeNote) {
        await sendTextMessage(from, `ℹ️ ${modeNote.trim()}`);
    }
};
