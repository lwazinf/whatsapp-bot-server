import { MerchantStatus } from '@prisma/client';
import { handleMerchantAction } from './merchantEngine';
import { handleOnboardingAction } from './onboardingEngine';
import { handleCustomerDiscovery } from './customerDiscovery';
import { handleCustomerOrders, handleFeedbackTextState } from './customerOrders';
import { handlePlatformAdminActions } from './platformAdmin';
import { handleHelpCommand } from './helpEngine';
import { sendTextMessage, sendButtons, sendListMessage, sendImageMessage } from './sender';
import { getPlatformSettings, getPlatformBranding } from './platformBranding';
import { createPaymentRequest } from '../payments/ozow';
import { db } from '../../lib/db';
import { handleAddressActions } from './customerAddress';

/**
 * Main entry point for all incoming WhatsApp messages
 */
export const handleIncomingMessage = async (message: any): Promise<void> => {
    if (!message || !message.from) {
        console.error('❌ Invalid message received: Missing from number');
        return;
    }

    const from = message.from;

    // Extract user input from various possible WhatsApp interactive types
    const textBody = message.text?.body;
    const buttonId = message.interactive?.button_reply?.id;
    const listId = message.interactive?.list_reply?.id;

    const input = String(buttonId || listId || textBody || '').trim();

    // Ignore empty messages unless they contain media/location for specific flows
    if (!input && message.type !== 'image' && message.type !== 'location') {
        console.log(`⚠️ Empty message from ${from}, skipping`);
        return;
    }

    try {
        const platformSettings = await getPlatformSettings(db);

        // 1. Session Management: Get or create session
        const session = await db.userSession.upsert({
            where: { wa_id: from },
            update: {},
            create: { wa_id: from, mode: 'CUSTOMER' }
        });

        // 2. Identify User Role (Merchant or Owner)
        let merchantForUser = null;
        if (session.active_merchant_id) {
            merchantForUser = await db.merchant.findUnique({ where: { id: session.active_merchant_id } });
        }
        if (!merchantForUser) {
            const directMerchant = await db.merchant.findUnique({ where: { wa_id: from } });
            const ownerRecord = await db.merchantOwner.findFirst({
                where: { wa_id: from, is_active: true },
                include: { merchant: true }
            });
            merchantForUser = directMerchant || ownerRecord?.merchant || null;
        }

        console.log(`📩 [${session.mode}] ${from}: "${input}"`);

        const normalizedInput = input.toLowerCase();

        // 3. GLOBAL COMMANDS

        // Help command — platform admin only (prevents leaking backend info to lower profiles)
        if (input === 'HelpOmeru' || normalizedInput === 'helpomeru') {
            if (isPlatformAdmin(from)) {
                await handleHelpCommand(from);
            } else if (session.mode === 'MERCHANT' && merchantForUser) {
                await handleMerchantAction(from, 'menu', session, merchantForUser, message);
            } else {
                await sendCustomerWelcome(from);
            }
            return;
        }

        // "Omeru" — drop all state and return to the user's main profile menu
        if (normalizedInput === 'omeru') {
            await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null, state: null } });
            if (session.mode === 'MERCHANT' && merchantForUser) {
                const freshSession = await db.userSession.findUnique({ where: { wa_id: from } });
                await handleMerchantAction(from, 'menu', freshSession!, merchantForUser, message);
            } else if (isPlatformAdmin(from)) {
                await handlePlatformAdminActions(from, 'admin');
            } else {
                await sendCustomerWelcome(from);
            }
            return;
        }

        // SwitchOmeru / switch — show a list of available modes
        if (normalizedInput === 'switch' || input === platformSettings.switchCode) {
            await handleSwitchMode(from, session);
            return;
        }

        // Switch mode selections
        if (input === 'sw_customer') {
            await db.userSession.update({ where: { wa_id: from }, data: { mode: 'CUSTOMER', active_merchant_id: null } });
            await sendCustomerWelcome(from);
            return;
        }

        if (input === 'sw_admin') {
            await db.userSession.update({ where: { wa_id: from }, data: { mode: 'CUSTOMER', active_merchant_id: null } });
            // Immediately show admin panel — no waiting for 'admin' command
            await handlePlatformAdminActions(from, 'admin');
            return;
        }

        if (input.startsWith('sw_merchant_')) {
            const merchantId = input.replace('sw_merchant_', '');
            const targetMerchant = await db.merchant.findUnique({ where: { id: merchantId } });
            const authorized = targetMerchant ? await isAuthorizedOwner(from, merchantId) : false;
            if (!targetMerchant || !authorized) {
                await sendTextMessage(from, '⛔ Store not found or access denied.');
                return;
            }
            const updatedSession = await db.userSession.update({
                where: { wa_id: from },
                data: { mode: 'MERCHANT', active_merchant_id: merchantId }
            });
            // Immediately show merchant dashboard — no waiting for 'menu' command
            await handleMerchantAction(from, 'menu', updatedSession, targetMerchant, message);
            return;
        }

        // Platform Admin Actions
        if (isPlatformAdmin(from) && (
            input === 'admin' ||
            input.startsWith('pa_') ||
            session.active_prod_id?.startsWith('PA_')
        )) {
            await handlePlatformAdminActions(from, input);
            return;
        }

        // Handle Invites (button response)
        if (input.startsWith('accept_invite_') || input.startsWith('decline_invite_')) {
            await handleInviteResponse(from, input);
            return;
        }

        // Handle invite short codes (e.g. "JOIN ABC123")
        const joinMatch = input.match(/^JOIN\s+([A-Z0-9]{6})$/i);
        if (joinMatch) {
            await handleInviteByCode(from, joinMatch[1].toUpperCase());
            return;
        }

        // Marketing Opt-Out
        if (isOptOutMessage(input)) {
            const updated = await handleOptOut(from, session.last_merchant_id);
            await sendTextMessage(from, updated ? '✅ You have been opted out of future updates.' : '⚠️ No recent merchant to opt out from.');
            return;
        }

        // Admin Handle Direct Access (e.g., @myshop_admin)
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
                await db.userSession.update({ where: { wa_id: from }, data: { mode: 'REGISTERING', active_merchant_id: adminMerchant.id } });
                await handleOnboardingAction(from, input, session, adminMerchant, message);
                return;
            }

            await db.userSession.update({ where: { wa_id: from }, data: { mode: 'MERCHANT', active_merchant_id: adminMerchant.id } });
            await handleMerchantAction(from, input, session, adminMerchant, message);
            return;
        }

        // 4. ROUTING LOGIC

        // Registration Flow — only while terms not yet accepted (after acceptance, route to MERCHANT mode)
        if (session.mode === 'REGISTERING' || (merchantForUser && merchantForUser.status !== MerchantStatus.ACTIVE && !merchantForUser.accepted_terms)) {
            const canOnboard = await canAccessOnboarding(from, merchantForUser?.id);
            if (!canOnboard) {
                await sendTextMessage(from, '⛔ Your account is not yet invited. Please contact the platform admin.');
                return;
            }
            // Show "Resuming" banner when merchant re-enters mid-flow
            const isEntryInput = ['hi', 'hello', 'hey', 'sell', 'register', 'start'].includes(normalizedInput);
            if (isEntryInput && merchantForUser?.trading_name && !session.active_prod_id) {
                await sendTextMessage(from, `👋 *Resuming your onboarding for *${merchantForUser.trading_name}*!\n\nLet's continue where you left off...`);
            }
            await handleOnboardingAction(from, input, session, merchantForUser, message);
            return;
        }

        // Merchant Mode
        if (session.mode === 'MERCHANT') {
            if (!merchantForUser) {
                await db.userSession.update({ where: { wa_id: from }, data: { mode: 'CUSTOMER', active_merchant_id: null } });
                await sendTextMessage(from, '⚠️ Merchant profile not found. Switched to Customer mode.');
                return;
            }
            const authorized = await isAuthorizedOwner(from, merchantForUser.id);
            if (!authorized) {
                await sendTextMessage(from, '⛔ You are not authorized to access this merchant.');
                await db.userSession.update({ where: { wa_id: from }, data: { mode: 'CUSTOMER', active_merchant_id: null } });
                return;
            }
            await handleMerchantAction(from, input, session, merchantForUser, message);
            return;
        }

        // Customer nav screens
        if (input === 'c_discover') {
            // Redirect directly to browse stores (category selection)
            await handleCustomerDiscovery(from, 'browse_shops');
            return;
        }

        if (input === 'c_account') {
            await sendButtons(from,
                '👤 *My Account*\n\nManage your orders and saved items.',
                [
                    { id: 'c_my_orders', title: '📦 My Orders' },
                    { id: 'c_wishlist', title: '❤️ Wishlist' },
                    { id: 'c_address', title: '📍 My Address' }
                ]
            );
            await sendButtons(from, 'More:', [
                { id: 'c_settings', title: '⚙️ Settings & Help' }
            ]);
            return;
        }

        if (input === 'c_find_shop') {
            await sendTextMessage(from,
                '🔍 *Find a Shop*\n\nType the shop handle to open it directly.\n\nExample: *@shopname*\n\n_Tip: Ask the shop for their handle!_'
            );
            return;
        }

        if (input === 'c_settings') {
            await sendButtons(from,
                '⚙️ *Settings & Help*',
                [
                    { id: 'helpomeru', title: '❓ Commands & Help' },
                    { id: 'c_home', title: '🏠 Home' }
                ]
            );
            return;
        }

        if (input === 'c_home' || normalizedInput === 'hi' || normalizedInput === 'hello' || normalizedInput === 'hey' || normalizedInput === 'start') {
            await sendCustomerWelcome(from);
            return;
        }

        // Address management
        if (input === 'c_address' || input === 'addr_change' || input === 'addr_manual'
            || input.startsWith('addr_pick_') || input === 'cart_addr') {
            await handleAddressActions(from, input, message);
            return;
        }

        // ADDR_FLOW active state
        if (session.active_prod_id === 'ADDR_FLOW') {
            if (message.type === 'location') {
                await handleAddressActions(from, '', message);
                return;
            }
            // Escape buttons: clear state and fall through to normal routing
            if (input === 'c_account' || input === 'c_home' || input === 'browse_shops') {
                await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null, state: null } });
                // falls through to normal routing below
            } else {
                await handleAddressActions(from, input, message);
                return;
            }
        }

        // Customer Discovery, Cart & Wishlist
        if (
            input.startsWith('@') ||
            input === 'browse_shops' || input.startsWith('browse_shops_p') ||
            input.startsWith('bcat_') ||
            input.startsWith('sp_') || input.startsWith('spf_') || input.startsWith('ssort_') ||
            input.startsWith('vpick_') ||
            input.startsWith('cat_') ||
            input.startsWith('prod_') || input.startsWith('variant_') ||
            input.startsWith('add_cart_') || input.startsWith('replace_cart_') ||
            input.startsWith('buy_now_prod_') || input.startsWith('buy_now_variant_') ||
            input.startsWith('resume_bnp_') || input.startsWith('resume_bnv_') ||
            input === 'c_cart' || input === 'cart_clear' || input === 'cart_checkout' || input === 'cart_confirm_order' ||
            input === 'cart_edit_qty' || input.startsWith('cedit_') ||
            input.startsWith('wish_prod_') || input === 'c_wishlist'
        ) {
            await handleCustomerDiscovery(from, input);
            return;
        }

        // Cart qty text input flow — intercept plain text when awaiting qty
        if (session.active_prod_id?.startsWith('cart_qty_')) {
            await handleCustomerDiscovery(from, input);
            return;
        }

        if (input === 'c_my_orders' || input.startsWith('view_order_') || input.startsWith('delete_order_') ||
            input.startsWith('pay_stale_') || input.startsWith('cfb_')) {
            await handleCustomerOrders(from, input);
            return;
        }

        // Feedback text input state
        if (session.active_prod_id?.startsWith('feedback_text_')) {
            await handleFeedbackTextState(from, input);
            return;
        }

        // Retry payment — resend Ozow link for an existing order
        if (input.startsWith('retry_payment_')) {
            const orderId = input.replace('retry_payment_', '');
            const order = await db.order.findUnique({
                where:   { id: orderId },
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
                await sendButtons(from,
                    `💳 *Payment link for Order #${order.id.slice(-5)}:*\n\n${paymentUrl}`,
                    [
                        { id: `retry_payment_${order.id}`, title: '🔄 New Link' },
                        { id: 'c_my_orders',               title: '📦 My Orders' }
                    ]
                );
            } catch (err: any) {
                console.error(`❌ Retry payment failed: ${err.message}`);
                await sendTextMessage(from, '⚠️ Could not generate payment link. Please try again in a moment.');
            }
            return;
        }

        // Trigger Merchant Registration
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

        // Default: Welcome Menu
        await sendCustomerWelcome(from);

    } catch (err: any) {
        console.error('❌ Handler Error:', err.message);
        await sendTextMessage(from, '⚠️ Something went wrong on our end. Please try again in a moment.');
    }
};

// ============ CUSTOMER WELCOME ============

const sendCustomerWelcome = async (from: string): Promise<void> => {
    const session = await db.userSession.findUnique({
        where: { wa_id: from },
        select: { cart_json: true, has_seen_onboarding: true }
    });

    const platformBranding = await getPlatformBranding(db);
    const platformName = platformBranding?.name || 'Omeru';

    // ── First visit: send full Omeru onboarding intro ─────────────────────────
    if (session && !session.has_seen_onboarding) {
        await db.userSession.update({ where: { wa_id: from }, data: { has_seen_onboarding: true } });

        const introText = [
            `👋 Welcome to *${platformName}*!`,
            ``,
            `Shop smarter, right here on WhatsApp — no apps needed.`,
            ``,
            `Here's what you can do:`,
            `🛍️ Browse stores & discover products`,
            `🛒 Add to cart & checkout in seconds`,
            `❤️ Save items to your wishlist`,
            `📦 Track your orders anytime`,
            ``,
            `💡 _Tip: Type @storename to visit any shop directly_`
        ].join('\n');

        if (platformBranding?.logo_url) {
            await sendImageMessage(from, platformBranding.logo_url, `Welcome to ${platformName}!`);
        }

        await sendButtons(from, introText, [
            { id: 'browse_shops', title: '🛍️ Browse Stores' },
            { id: 'c_account', title: '👤 My Account' }
        ]);
        return;
    }

    // ── Returning user ────────────────────────────────────────────────────────
    let cartCount = 0;
    try {
        if (session?.cart_json) {
            const cart = JSON.parse(session.cart_json);
            cartCount = cart.items?.reduce((s: number, i: any) => s + i.qty, 0) || 0;
        }
    } catch { /* ignore */ }

    const buttons: Array<{ id: string; title: string }> = [
        { id: 'browse_shops', title: '🛍️ Browse Stores' },
        { id: 'c_account', title: '👤 My Account' }
    ];
    if (cartCount > 0) buttons.splice(1, 0, { id: 'c_cart', title: `🛒 Cart (${cartCount})` });

    const cartHint = cartCount > 0 ? `\n🛒 ${cartCount} item${cartCount !== 1 ? 's' : ''} in your cart` : '';
    await sendButtons(
        from,
        `🔥 *${platformName}* — Shop on WhatsApp!${cartHint}\n\nWhat are you looking for?`,
        buttons.slice(0, 3)
    );
};

// ============ SWITCH MODE ============

const handleSwitchMode = async (from: string, _session: any): Promise<void> => {
    // Find all stores this user has access to
    const directMerchant = await db.merchant.findUnique({ where: { wa_id: from } });
    const ownerRecords = await db.merchantOwner.findMany({
        where: { wa_id: from, is_active: true },
        include: { merchant: true }
    });

    const stores: Array<{ id: string; name: string }> = [];
    if (directMerchant && directMerchant.status === MerchantStatus.ACTIVE) {
        stores.push({ id: directMerchant.id, name: directMerchant.trading_name });
    }
    for (const rec of ownerRecords) {
        if (rec.merchant.status === MerchantStatus.ACTIVE && !stores.find(s => s.id === rec.merchant.id)) {
            stores.push({ id: rec.merchant.id, name: rec.merchant.trading_name });
        }
    }

    const isAdmin = isPlatformAdmin(from);
    const totalOptions = 1 + (isAdmin ? 1 : 0) + stores.length;

    if (totalOptions <= 3) {
        // Use buttons for 2-3 options
        const buttons: Array<{ id: string; title: string }> = [
            { id: 'sw_customer', title: '👤 Customer Mode' }
        ];
        if (isAdmin) buttons.push({ id: 'sw_admin', title: '🛡️ Platform Admin' });
        for (const store of stores.slice(0, 3 - buttons.length)) {
            buttons.push({ id: `sw_merchant_${store.id}`, title: `🏪 ${store.name}`.substring(0, 20) });
        }
        await sendButtons(from, '🔄 *Switch Mode*\n\nChoose where to go:', buttons);
    } else {
        // Use list for 4+ options
        const rows: Array<{ id: string; title: string; description: string }> = [
            { id: 'sw_customer', title: '👤 Customer Mode', description: 'Browse shops & manage orders' }
        ];
        if (isAdmin) {
            rows.push({ id: 'sw_admin', title: '🛡️ Platform Admin', description: 'Manage platform & merchants' });
        }
        for (const store of stores) {
            rows.push({ id: `sw_merchant_${store.id}`, title: `🏪 ${store.name}`.substring(0, 24), description: 'Merchant dashboard' });
        }
        await sendListMessage(from, '🔄 *Switch Mode*\n\nChoose where to go:', '🔄 Select Mode', [
            { title: 'Available Modes', rows }
        ]);
    }
};

// ============ HELPER FUNCTIONS ============

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

const normalizePhone = (p: string): string => p.replace(/[^\d]/g, '');

const handleInviteResponse = async (waId: string, input: string): Promise<void> => {
    const [action, inviteId] = input.split('_invite_');
    if (!inviteId) {
        await sendTextMessage(waId, '⚠️ Invite ID missing.');
        return;
    }
    const invite = await db.merchantInvite.findUnique({
        where: { id: inviteId },
        include: { merchant: true }
    });
    if (!invite || normalizePhone(invite.invited_wa_id) !== normalizePhone(waId) || invite.status !== 'PENDING') {
        await sendTextMessage(waId, '⚠️ This invite is no longer valid.');
        return;
    }

    await processInviteAccept(waId, invite, action === 'accept');
};

const handleInviteByCode = async (waId: string, code: string): Promise<void> => {
    const invite = await db.merchantInvite.findFirst({
        where: { short_code: code },
        include: { merchant: true }
    });
    if (!invite || invite.status !== 'PENDING') {
        await sendTextMessage(waId, '⚠️ Invite code not found or already used.');
        return;
    }
    // Verify number if set (invited_wa_id may have been set with + prefix)
    if (invite.invited_wa_id && normalizePhone(invite.invited_wa_id) !== normalizePhone(waId)) {
        await sendTextMessage(waId, '⚠️ This invite code is for a different number.');
        return;
    }

    // Show accept/decline prompt
    const merchantName = (invite as any).merchant?.trading_name || 'this store';
    await sendButtons(
        waId,
        `👋 You have been invited to manage *${merchantName}*.\n\nAccept this invite?`,
        [
            { id: `accept_invite_${invite.id}`, title: '✅ Accept' },
            { id: `decline_invite_${invite.id}`, title: '❌ Decline' }
        ]
    );
};

const processInviteAccept = async (waId: string, invite: any, accept: boolean): Promise<void> => {
    if (accept) {
        await db.merchantOwner.upsert({
            where: { merchant_id_wa_id: { merchant_id: invite.merchant_id, wa_id: waId } },
            update: { is_active: true, role: invite.role },
            create: { merchant_id: invite.merchant_id, wa_id: waId, role: invite.role }
        });
        await db.merchantInvite.update({
            where: { id: invite.id },
            data: { status: 'ACCEPTED', accepted_at: new Date() }
        });
        await db.userSession.upsert({
            where: { wa_id: waId },
            update: { mode: 'MERCHANT', active_merchant_id: invite.merchant_id },
            create: { wa_id: waId, mode: 'MERCHANT', active_merchant_id: invite.merchant_id }
        });
        const merchantName = invite.merchant?.trading_name || 'the store';
        await sendTextMessage(waId, `✅ Invite accepted! You now have access to *${merchantName}*. Type *menu* to open the dashboard.`);
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
        where: { merchant_id: merchantId, status: 'ACCEPTED' }
    });
    // Check if this waId is the invited one
    const pendingInvite = await db.merchantInvite.findFirst({
        where: { merchant_id: merchantId, status: 'PENDING' }
    });
    if (pendingInvite && normalizePhone(pendingInvite.invited_wa_id) === normalizePhone(waId)) return true;
    return Boolean(invite);
};

const hasPendingInvite = async (waId: string): Promise<boolean> => {
    const allPending = await db.merchantInvite.findMany({
        where: { status: 'PENDING' }
    });
    return allPending.some((inv: any) => normalizePhone(inv.invited_wa_id) === normalizePhone(waId));
};

const isPlatformAdmin = (waId: string): boolean => {
    const configured = process.env.PLATFORM_ADMIN_NUMBERS || process.env.ADMIN_WHATSAPP_NUMBER || '';
    const admins = configured
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .map(normalizePhone);
    return admins.includes(normalizePhone(waId));
};
