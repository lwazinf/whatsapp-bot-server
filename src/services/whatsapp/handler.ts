import { PrismaClient, MerchantStatus } from '@prisma/client';
import { handleMerchantAction } from './merchantEngine';
import { handleOnboardingAction } from './onboardingEngine';
import { handleCustomerDiscovery } from './customerDiscovery';
import { handleCustomerOrders } from './customerOrders';
import { handlePlatformAdminActions } from './platformAdmin';
import { sendTextMessage, sendButtons } from './sender';
import { getPlatformSettings } from './platformBranding';

// Singleton PrismaClient
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export const handleIncomingMessage = async (message: any): Promise<void> => {
    if (!message || !message.from) {
        console.error('❌ Invalid message received');
        return;
    }

    const from = message.from;
    
    // Extract input from various message types
    const textBody = message.text?.body;
    const buttonId = message.interactive?.button_reply?.id;
    const listId = message.interactive?.list_reply?.id;
    
    const input = String(buttonId || listId || textBody || '').trim();

    if (!input && message.type !== 'image' && message.type !== 'location') {
        console.log(`⚠️ Empty message from ${from}, skipping`);
        return;
    }

    try {
        const platformSettings = await getPlatformSettings(db);
        // Get or create session
        const session = await db.userSession.upsert({
            where: { wa_id: from },
            update: {},
            create: { wa_id: from, mode: 'CUSTOMER' }
        });

        const merchant = await db.merchant.findUnique({ where: { wa_id: from } });
        const ownerRecord = await db.merchantOwner.findFirst({
            where: { wa_id: from, is_active: true },
            include: { merchant: true }
        });
        const merchantForUser = merchant || ownerRecord?.merchant || null;

        console.log(`📩 [${session.mode}] ${from}: "${input}"`);

        const normalizedInput = input.toLowerCase();

        // Global: Switch Modes
        if (normalizedInput === 'switch' || input === platformSettings.switchCode) {
            const newMode = session.mode === 'CUSTOMER' ? 'MERCHANT' : 'CUSTOMER';
            await db.userSession.update({
                where: { wa_id: from },
                data: { mode: newMode }
            });
            await sendTextMessage(from, `🔄 Switched to *${newMode}* mode.`);
            return;
        }

        if (isPlatformAdmin(from) && (input === 'admin' || input.startsWith('pa_') || session.active_prod_id?.startsWith('PA_'))) {
            await handlePlatformAdminActions(from, input);
            return;
        }

        if (input.startsWith('accept_invite_') || input.startsWith('decline_invite_')) {
            await handleInviteResponse(from, input);
            return;
        }

        if (isOptOutMessage(input)) {
            const updated = await handleOptOut(from, session.last_merchant_id);
            await sendTextMessage(from, updated ? '✅ You have been opted out of future updates.' : '⚠️ No recent merchant to opt out from.');
            return;
        }

        const adminHandle = getAdminHandleInput(input);
        if (adminHandle) {
            const adminMerchant = await db.merchant.findFirst({ where: { admin_handle: adminHandle } });
            if (!adminMerchant) {
                await sendTextMessage(from, '❌ Admin handle not found.');
                return;
            }
            const authorized = await isAuthorizedOwner(from, adminMerchant.id);
            if (!authorized) {
                await sendTextMessage(from, '⛔ You are not authorized to access this merchant.');
                return;
            }

            if (adminMerchant.status !== MerchantStatus.ACTIVE) {
                const canOnboard = await canAccessOnboarding(from, adminMerchant.id);
                if (!canOnboard) {
                    await sendTextMessage(from, '⛔ Your account is not yet invited. Please contact the platform admin.');
                    return;
                }
                await db.userSession.update({ where: { wa_id: from }, data: { mode: 'REGISTERING' } });
                await handleOnboardingAction(from, input, session, adminMerchant, message);
                return;
            }

            await db.userSession.update({ where: { wa_id: from }, data: { mode: 'MERCHANT' } });
            await handleMerchantAction(from, input, session, adminMerchant, message);
            return;
        }

        // Merchant & Onboarding Routing
        if (session.mode === 'REGISTERING' || (merchantForUser && merchantForUser.status !== MerchantStatus.ACTIVE)) {
            const canOnboard = await canAccessOnboarding(from, merchantForUser?.id);
            if (!canOnboard) {
                await sendTextMessage(from, '⛔ Your account is not yet invited. Please contact the platform admin.');
                return;
            }
            await handleOnboardingAction(from, input, session, merchantForUser, message);
            return;
        }

        if (session.mode === 'MERCHANT') {
            if (!merchantForUser) {
                await db.userSession.update({ where: { wa_id: from }, data: { mode: 'CUSTOMER' } });
                await sendTextMessage(from, '⚠️ Merchant profile not found. Switched to Customer mode.');
                return;
            }
            const authorized = await isAuthorizedOwner(from, merchantForUser.id);
            if (!authorized) {
                await sendTextMessage(from, '⛔ You are not authorized to access this merchant.');
                await db.userSession.update({ where: { wa_id: from }, data: { mode: 'CUSTOMER' } });
                return;
            }
            await handleMerchantAction(from, input, session, merchantForUser, message);
            return;
        }

        // Customer Routing
        if (input.startsWith('@') || input === 'browse_shops' || input.startsWith('cat_') || input.startsWith('prod_') || input.startsWith('variant_')) {
            await handleCustomerDiscovery(from, input);
            return;
        }
        
        if (input === 'c_my_orders' || input.startsWith('view_order_')) {
            await handleCustomerOrders(from, input);
            return;
        }

        // Start merchant registration
        if (normalizedInput === 'sell' || normalizedInput === 'register') {
            const hasInvite = await hasPendingInvite(from);
            if (!hasInvite) {
                await sendTextMessage(from, '⛔ Registration is invite-only. Please contact the platform admin.');
                return;
            }
            await db.userSession.update({
                where: { wa_id: from },
                data: { mode: 'REGISTERING' }
            });
            await sendTextMessage(from, 
                '🏪 *Start Selling on Omeru!*\n\n' +
                "Let's set up your shop.\n\n" +
                '📝 *Step 1 of 6: Shop Name*\n' +
                'What is your trading/shop name?'
            );
            return;
        }

        // Default Customer Welcome
        await sendButtons(from, '👋 Welcome to *Omeru*!\n\nWhat would you like to do?', [
            { id: 'browse_shops', title: '🪪 Browse Shops' },
            { id: 'c_my_orders', title: '📦 My Orders' }
        ]);

    } catch (err: any) {
        console.error('❌ Handler Error:', err.message);
        await sendTextMessage(from, '⚠️ Something went wrong. Please try again.');
    }
};

const getAdminHandleInput = (input: string): string | null => {
    if (!input.startsWith('@')) return null;
    const firstToken = input.split(/\s+/)[0];
    const handle = firstToken.slice(1).toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!handle.endsWith('_admin')) return null;
    return handle || null;
};

const isOptOutMessage = (input: string): boolean => {
    const normalized = input.trim().toLowerCase();
    return ['stop', 'unsubscribe', 'optout', 'opt-out'].includes(normalized);
};

const handleOptOut = async (waId: string, lastMerchantId?: string | null): Promise<boolean> => {
    if (!lastMerchantId) return false;
    await db.merchantCustomer.upsert({
        where: { merchant_id_wa_id: { merchant_id: lastMerchantId, wa_id: waId } },
        update: { opt_out: true, last_interaction_at: new Date() },
        create: { merchant_id: lastMerchantId, wa_id: waId, opt_out: true, last_interaction_at: new Date() }
    });
    return true;
};

const handleInviteResponse = async (waId: string, input: string): Promise<void> => {
    const [action, inviteId] = input.split('_invite_');
    if (!inviteId) {
        await sendTextMessage(waId, '⚠️ Invite not found.');
        return;
    }
    const invite = await db.merchantInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.invited_wa_id !== waId || invite.status !== 'PENDING') {
        await sendTextMessage(waId, '⚠️ Invite not found or already handled.');
        return;
    }

    if (action === 'accept') {
        await db.merchantOwner.upsert({
            where: { merchant_id_wa_id: { merchant_id: invite.merchant_id, wa_id: waId } },
            update: { is_active: true, role: invite.role },
            create: { merchant_id: invite.merchant_id, wa_id: waId, role: invite.role }
        });
        await db.merchantInvite.update({
            where: { id: invite.id },
            data: { status: 'ACCEPTED', accepted_at: new Date(), revoked_at: null }
        });
        await db.userSession.update({ where: { wa_id: waId }, data: { mode: 'MERCHANT' } });
        await sendTextMessage(waId, '✅ Invite accepted. You now have merchant access.');
        return;
    }

    await db.merchantInvite.update({
        where: { id: invite.id },
        data: { status: 'REVOKED', revoked_at: new Date() }
    });
    await sendTextMessage(waId, '❌ Invite declined.');
};

const isAuthorizedOwner = async (waId: string, merchantId: string): Promise<boolean> => {
    const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
    if (merchant?.wa_id === waId) return true;
    const owner = await db.merchantOwner.findUnique({
        where: { merchant_id_wa_id: { merchant_id: merchantId, wa_id: waId } }
    });
    return Boolean(owner?.is_active);
};

const canAccessOnboarding = async (waId: string, merchantId?: string | null): Promise<boolean> => {
    if (!merchantId) return false;
    const owner = await db.merchantOwner.findUnique({
        where: { merchant_id_wa_id: { merchant_id: merchantId, wa_id: waId } }
    });
    if (owner?.is_active) return true;
    const invite = await db.merchantInvite.findFirst({
        where: { merchant_id: merchantId, invited_wa_id: waId, status: 'ACCEPTED' }
    });
    return Boolean(invite);
};

const hasPendingInvite = async (waId: string): Promise<boolean> => {
    const invite = await db.merchantInvite.findFirst({
        where: { invited_wa_id: waId, status: 'PENDING' }
    });
    return Boolean(invite);
};

const isPlatformAdmin = (waId: string): boolean => {
    const configured = process.env.PLATFORM_ADMIN_NUMBERS || process.env.ADMIN_WHATSAPP_NUMBER || '';
    const admins = configured
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .map(normalizeWaId);
    return admins.includes(normalizeWaId(waId));
};

const normalizeWaId = (value: string): string => value.replace(/[^\d]/g, '');
