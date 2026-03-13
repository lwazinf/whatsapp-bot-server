import { Prisma, Merchant, MerchantOwnerRole, UserSession } from '@prisma/client';
import { sendTextMessage, sendButtons, sendListMessage } from './sender';
import { logInviteAdded, logInviteRevoked } from './adminEngine';
import { STORE_CATEGORIES } from './customerDiscovery';
import { db } from '../../lib/db';

const logAudit = async ({
    actorWaId,
    action,
    entityType,
    entityId,
    metadata
}: {
    actorWaId: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue | null;
}): Promise<void> => {
    await db.auditLog.create({
        data: {
            actor_wa_id: actorWaId,
            action,
            entity_type: entityType,
            entity_id: entityId,
            metadata_json: metadata ?? undefined
        }
    });
};

const STATE = {
    BIO: 'SET_BIO',
    LOGO: 'SET_LOGO',
    WELCOME_IMG: 'SET_WELCOME_IMG',
    ADDRESS: 'SET_ADDR',
    HOURS_MF: 'SET_HRS_MF',
    HOURS_SAT: 'SET_HRS_SAT',
    BRAND_NAME: 'SET_BRAND_NAME',
    CURRENCY: 'SET_CURRENCY',
    LOCALE: 'SET_LOCALE',
    SUPPORT_NUMBER: 'SET_SUPPORT_NUMBER',
    WELCOME_MESSAGE: 'SET_WELCOME_MESSAGE',
    OWNER_INVITE: 'SET_OWNER_INVITE',
    OWNER_REMOVE: 'SET_OWNER_REMOVE',
    HANDLE: 'SET_HANDLE',
    ADMIN_HANDLE: 'SET_ADMIN_HANDLE'
};

export const handleSettingsActions = async (
    from: string, 
    input: string, 
    session: UserSession, 
    merchant: Merchant, 
    message?: any
): Promise<void> => {
    try {
        const state = session.active_prod_id || '';
        const owner = await db.merchantOwner.findUnique({
            where: { merchant_id_wa_id: { merchant_id: merchant.id, wa_id: from } }
        });
        const ownerRole = owner?.role || (merchant.wa_id === from ? MerchantOwnerRole.OWNER : MerchantOwnerRole.STAFF);

        // Main Settings Menu
        if (input === 'm_settings' || input === 's_back') {
            await clearState(from);
            const status = merchant.manual_closed ? '🔴 CLOSED' : '🟢 OPEN';
            const browseStatus = (merchant as any).show_in_browse ? '👁️ Visible in Browse' : '🙈 Hidden from Browse';

            await sendButtons(from,
                `🛠️ *Settings*\n\n🏪 ${merchant.trading_name}\n${status} • ${browseStatus}\n\n📝 ${merchant.description || '_No bio_'}\n📍 ${merchant.address || '_No address_'}`,
                [
                    { id: 's_profile', title: '👤 Edit Profile' },
                    { id: 's_hours', title: '⏰ Hours' },
                    { id: 's_toggle', title: merchant.manual_closed ? '🔓 Open Shop' : '🔒 Close Shop' }
                ]
            );
            await sendButtons(from, 'More:', [
                { id: 's_browse_toggle', title: (merchant as any).show_in_browse ? '🙈 Hide from Browse' : '👁️ Show in Browse' },
                { id: 'm_dashboard', title: '🏠 Dashboard' }
            ]);
            return;
        }

        // Profile Menu
        if (input === 's_profile') {
            await sendButtons(from, '👤 *Edit Profile*', [
                { id: 's_bio', title: '📝 Description' },
                { id: 's_logo', title: '📸 Logo' },
                { id: 's_addr', title: '📍 Address' }
            ]);
            await sendButtons(from, 'More:', [
                { id: 's_brand_name', title: '🏷️ Brand Name' },
                { id: 's_currency', title: '💱 Currency' },
                { id: 's_locale', title: '🌍 Locale' }
            ]);
            await sendButtons(from, 'More:', [
                { id: 's_support_number', title: '☎️ Support Number' },
                { id: 's_welcome_message', title: '👋 Welcome Message' },
                { id: 's_welcome_img', title: '🖼️ Welcome Image' }
            ]);
            await sendButtons(from, 'More:', [
                { id: 's_handle', title: '🔗 Store Handle' },
                { id: 's_admin_handle', title: '🔐 Admin Handle' },
                { id: 's_owners', title: '👥 Owners' }
            ]);
            await sendButtons(from, 'More:', [
                { id: 's_category', title: '🏷️ Store Category' },
                { id: 's_back', title: '⬅️ Back' }
            ]);
            return;
        }

        // Bio
        if (input === 's_bio') {
            await setState(from, STATE.BIO);
            await sendTextMessage(from, `📝 *Description*\n\nCurrent: ${merchant.description || '_Not set_'}\n\nType your new description (or "clear" to remove):`);
            return;
        }

        if (state === STATE.BIO) {
            const newBio = input.toLowerCase() === 'clear' ? null : input.substring(0, 200);
            await db.merchant.update({ where: { id: merchant.id }, data: { description: newBio } });
            await logAudit({
                actorWaId: from,
                action: newBio ? 'MERCHANT_DESCRIPTION_UPDATED' : 'MERCHANT_DESCRIPTION_CLEARED',
                entityType: 'MERCHANT',
                entityId: merchant.id,
                metadata: { description: newBio }
            });
            await clearState(from);
            await sendTextMessage(from, newBio ? '✅ Description updated!' : '✅ Description cleared.');
            await handleSettingsActions(from, 's_profile', session, merchant);
            return;
        }

        // Logo
        if (input === 's_logo') {
            await setState(from, STATE.LOGO);
            await sendButtons(from, '📸 Send an image for your logo.', [
                { id: 's_clear_logo', title: '🗑️ Remove Logo' },
                { id: 's_cancel', title: '❌ Cancel' }
            ]);
            return;
        }

        if (state === STATE.LOGO) {
            if (message?.type === 'image' && message?.image?.id) {
                await db.merchant.update({ where: { id: merchant.id }, data: { image_url: message.image.id } });
                await upsertBranding(merchant.id, { logo_url: message.image.id });
                await logAudit({
                    actorWaId: from,
                    action: 'MERCHANT_LOGO_UPDATED',
                    entityType: 'MERCHANT',
                    entityId: merchant.id,
                    metadata: { image_url: message.image.id }
                });
                await clearState(from);
                await sendTextMessage(from, '✅ Logo updated!');
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }
            if (input === 's_clear_logo') {
                await db.merchant.update({ where: { id: merchant.id }, data: { image_url: null } });
                await upsertBranding(merchant.id, { logo_url: null });
                await logAudit({
                    actorWaId: from,
                    action: 'MERCHANT_LOGO_REMOVED',
                    entityType: 'MERCHANT',
                    entityId: merchant.id,
                    metadata: { image_url: null }
                });
                await clearState(from);
                await sendTextMessage(from, '✅ Logo removed.');
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }
            if (input === 's_cancel') {
                await clearState(from);
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }
            await sendButtons(from, '⚠️ Send an image.', [{ id: 's_cancel', title: '❌ Cancel' }]);
            return;
        }

        // Address
        if (input === 's_addr') {
            await setState(from, STATE.ADDRESS);
            await sendTextMessage(from, `📍 *Address*\n\nCurrent: ${merchant.address || '_Not set_'}\n\nType address or send location pin (or "clear"):`);
            return;
        }

        if (state === STATE.ADDRESS) {
            let addr: string | null = input;
            if (message?.type === 'location') {
                addr = `📍 ${message.location.latitude}, ${message.location.longitude}`;
            } else if (input.toLowerCase() === 'clear') {
                addr = null;
            }
            await db.merchant.update({ where: { id: merchant.id }, data: { address: addr } });
            await logAudit({
                actorWaId: from,
                action: addr ? 'MERCHANT_ADDRESS_UPDATED' : 'MERCHANT_ADDRESS_CLEARED',
                entityType: 'MERCHANT',
                entityId: merchant.id,
                metadata: { address: addr }
            });
            await clearState(from);
            await sendTextMessage(from, addr ? '✅ Address updated!' : '✅ Address cleared.');
            await handleSettingsActions(from, 's_profile', session, merchant);
            return;
        }

        // Brand Name
        if (input === 's_brand_name') {
            await setState(from, STATE.BRAND_NAME);
            await sendTextMessage(
                from,
                `🏷️ *Brand Name*\n\nCurrent: ${merchant.brand_name || '_Not set_'}\n\nType your brand name (or "clear" to remove):`
            );
            return;
        }

        if (state === STATE.BRAND_NAME) {
            const brandName = input.toLowerCase() === 'clear' ? null : input.substring(0, 60);
            await db.merchant.update({ where: { id: merchant.id }, data: { brand_name: brandName } });
            await clearState(from);
            await sendTextMessage(from, brandName ? '✅ Brand name updated!' : '✅ Brand name cleared.');
            await handleSettingsActions(from, 's_profile', session, merchant);
            return;
        }

        // Currency
        if (input === 's_currency') {
            await setState(from, STATE.CURRENCY);
            await sendTextMessage(
                from,
                `💱 *Currency*\n\nCurrent: ${merchant.currency || '_Not set_'}\n\nEnter ISO currency code (e.g. USD, ZAR) or "clear":`
            );
            return;
        }

        if (state === STATE.CURRENCY) {
            if (input.toLowerCase() === 'clear') {
                await db.merchant.update({ where: { id: merchant.id }, data: { currency: null } });
                await upsertBranding(merchant.id, { currency: null });
                await clearState(from);
                await sendTextMessage(from, '✅ Currency cleared.');
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }

            const currency = input.trim().toUpperCase();
            if (!isValidCurrencyCode(currency)) {
                await sendTextMessage(from, '⚠️ Please enter a valid 3-letter currency code (e.g. USD).');
                return;
            }

            await db.merchant.update({ where: { id: merchant.id }, data: { currency } });
            await upsertBranding(merchant.id, { currency });
            await clearState(from);
            await sendTextMessage(from, '✅ Currency updated!');
            await handleSettingsActions(from, 's_profile', session, merchant);
            return;
        }

        // Locale
        if (input === 's_locale') {
            await setState(from, STATE.LOCALE);
            await sendTextMessage(
                from,
                `🌍 *Locale*\n\nCurrent: ${merchant.locale || '_Not set_'}\n\nEnter a locale like en-ZA or en-US, or "clear":`
            );
            return;
        }

        if (state === STATE.LOCALE) {
            if (input.toLowerCase() === 'clear') {
                await db.merchant.update({ where: { id: merchant.id }, data: { locale: null } });
                await upsertBranding(merchant.id, { locale: null });
                await clearState(from);
                await sendTextMessage(from, '✅ Locale cleared.');
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }

            const locale = input.trim();
            if (!isValidLocale(locale)) {
                await sendTextMessage(from, '⚠️ Enter a valid locale like en-ZA or en-US.');
                return;
            }

            await db.merchant.update({ where: { id: merchant.id }, data: { locale } });
            await upsertBranding(merchant.id, { locale });
            await clearState(from);
            await sendTextMessage(from, '✅ Locale updated!');
            await handleSettingsActions(from, 's_profile', session, merchant);
            return;
        }

        // Support Number
        if (input === 's_support_number') {
            await setState(from, STATE.SUPPORT_NUMBER);
            await sendTextMessage(
                from,
                `☎️ *Support Number*\n\nCurrent: ${merchant.support_number || '_Not set_'}\n\nEnter phone in E.164 format (e.g. +15551234567) or "clear":`
            );
            return;
        }

        if (state === STATE.SUPPORT_NUMBER) {
            if (input.toLowerCase() === 'clear') {
                await db.merchant.update({ where: { id: merchant.id }, data: { support_number: null } });
                await clearState(from);
                await sendTextMessage(from, '✅ Support number cleared.');
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }

            const supportNumber = input.trim();
            if (!isValidPhoneNumber(supportNumber)) {
                await sendTextMessage(from, '⚠️ Enter a valid phone number in E.164 format (e.g. +15551234567).');
                return;
            }

            await db.merchant.update({ where: { id: merchant.id }, data: { support_number: supportNumber } });
            await clearState(from);
            await sendTextMessage(from, '✅ Support number updated!');
            await handleSettingsActions(from, 's_profile', session, merchant);
            return;
        }

        // Welcome Message
        if (input === 's_welcome_message') {
            await setState(from, STATE.WELCOME_MESSAGE);
            await sendTextMessage(
                from,
                `👋 *Welcome Message*\n\nCurrent: ${merchant.welcome_message || '_Not set_'}\n\nType your welcome message (or "clear" to remove):`
            );
            return;
        }

        if (state === STATE.WELCOME_MESSAGE) {
            const welcomeMessage = input.toLowerCase() === 'clear' ? null : input.substring(0, 200);
            await db.merchant.update({ where: { id: merchant.id }, data: { welcome_message: welcomeMessage } });
            await clearState(from);
            await sendTextMessage(from, welcomeMessage ? '✅ Welcome message updated!' : '✅ Welcome message cleared.');
            await handleSettingsActions(from, 's_profile', session, merchant);
            return;
        }

        // Browse toggle
        if (input === 's_browse_toggle') {
            const newVal = !(merchant as any).show_in_browse;
            await db.merchant.update({ where: { id: merchant.id }, data: { show_in_browse: newVal } as any });
            await sendTextMessage(from, newVal
                ? '👁️ Your store is now *visible* in the Browse Shops list.'
                : '🙈 Your store is now *hidden* from the Browse Shops list.');
            const updated = await db.merchant.findUnique({ where: { id: merchant.id } });
            await handleSettingsActions(from, 'm_settings', session, updated!);
            return;
        }

        // Welcome Image
        if (input === 's_welcome_img') {
            await setState(from, STATE.WELCOME_IMG);
            const currentImg = (merchant as any).welcome_image_url;
            await sendButtons(from,
                `🖼️ *Welcome Image*\n\nShown when customers visit your store via @handle.\n\nCurrent: ${currentImg ? '✅ Set' : '❌ Not set'}\n\nSend an image to update:`,
                [
                    { id: 's_clear_welcome_img', title: '🗑️ Remove Image' },
                    { id: 's_cancel', title: '❌ Cancel' }
                ]
            );
            return;
        }

        if (state === STATE.WELCOME_IMG) {
            if (message?.type === 'image' && message?.image?.id) {
                await db.merchant.update({ where: { id: merchant.id }, data: { welcome_image_url: message.image.id } as any });
                await clearState(from);
                await sendTextMessage(from, '✅ Welcome image updated!');
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }
            if (input === 's_clear_welcome_img') {
                await db.merchant.update({ where: { id: merchant.id }, data: { welcome_image_url: null } as any });
                await clearState(from);
                await sendTextMessage(from, '✅ Welcome image removed.');
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }
            if (input === 's_cancel') {
                await clearState(from);
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }
            await sendButtons(from, '⚠️ Send an image or cancel.', [{ id: 's_cancel', title: '❌ Cancel' }]);
            return;
        }

        // Store Handle change
        if (input === 's_handle') {
            await setState(from, STATE.HANDLE);
            await sendTextMessage(from,
                `🔗 *Store Handle*\n\nCurrent: @${merchant.handle}\n\nEnter new handle (3–20 chars, a–z 0–9 _ only).\nOr type "cancel" to abort:`
            );
            return;
        }

        if (state === STATE.HANDLE) {
            if (input.toLowerCase() === 'cancel') {
                await clearState(from);
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }
            const newHandle = input.trim().toLowerCase();
            if (!/^[a-z0-9_]{3,20}$/.test(newHandle)) {
                await sendTextMessage(from, '⚠️ Handle must be 3–20 characters, using only a–z, 0–9, and _.\n\nTry again or type "cancel":');
                return;
            }
            const existingHandle = await db.merchant.findFirst({ where: { handle: newHandle, NOT: { id: merchant.id } } });
            if (existingHandle) {
                await sendTextMessage(from, `⚠️ @${newHandle} is already in use. Try a different handle:`);
                return;
            }
            await db.merchant.update({ where: { id: merchant.id }, data: { handle: newHandle } });
            await logAudit({
                actorWaId: from,
                action: 'MERCHANT_HANDLE_UPDATED',
                entityType: 'MERCHANT',
                entityId: merchant.id,
                metadata: { handle: newHandle }
            });
            await clearState(from);
            await sendTextMessage(from, `✅ Handle updated to *@${newHandle}*!`);
            const updatedMerchant = await db.merchant.findUnique({ where: { id: merchant.id } });
            await handleSettingsActions(from, 's_profile', session, updatedMerchant!);
            return;
        }

        // Admin Handle change
        if (input === 's_admin_handle') {
            await setState(from, STATE.ADMIN_HANDLE);
            await sendTextMessage(from,
                `🔐 *Admin Handle*\n\nCurrent: @${merchant.admin_handle || 'not set'}\n\nEnter new admin handle (4–30 chars, a–z 0–9 _ only).\nOr type "cancel" to abort:`
            );
            return;
        }

        if (state === STATE.ADMIN_HANDLE) {
            if (input.toLowerCase() === 'cancel') {
                await clearState(from);
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }
            const newAdminHandle = input.trim().toLowerCase();
            if (!/^[a-z0-9_]{4,30}$/.test(newAdminHandle)) {
                await sendTextMessage(from, '⚠️ Admin handle must be 4–30 characters, using only a–z, 0–9, and _.\n\nTry again or type "cancel":');
                return;
            }
            const existingAdminHandle = await db.merchant.findFirst({ where: { admin_handle: newAdminHandle, NOT: { id: merchant.id } } });
            if (existingAdminHandle) {
                await sendTextMessage(from, `⚠️ @${newAdminHandle} is already in use. Try a different handle:`);
                return;
            }
            await db.merchant.update({ where: { id: merchant.id }, data: { admin_handle: newAdminHandle } });
            await logAudit({
                actorWaId: from,
                action: 'MERCHANT_ADMIN_HANDLE_UPDATED',
                entityType: 'MERCHANT',
                entityId: merchant.id,
                metadata: { admin_handle: newAdminHandle }
            });
            await clearState(from);
            await sendTextMessage(from, `✅ Admin handle updated to *@${newAdminHandle}*!`);
            const updatedMerchant = await db.merchant.findUnique({ where: { id: merchant.id } });
            await handleSettingsActions(from, 's_profile', session, updatedMerchant!);
            return;
        }

        // Store Category
        if (input === 's_category') {
            const currentCat = (merchant as any).store_category as string | null;
            const currentLabel = currentCat
                ? (STORE_CATEGORIES.find(c => c.slug === currentCat)?.label ?? currentCat)
                : 'Not set';
            const rows = STORE_CATEGORIES.map(c => ({
                id: `mcat_${c.slug}`,
                title: `${c.emoji} ${c.label}`,
                description: currentCat === c.slug ? '✅ Current' : ''
            }));
            await sendListMessage(from,
                `🏷️ *Store Category*\n\nCurrent: ${currentLabel}\n\nChoose a category for your store:`,
                '🏷️ Select',
                [{ title: 'Categories', rows }]
            );
            return;
        }

        if (input.startsWith('mcat_')) {
            const slug = input.replace('mcat_', '');
            const cat = STORE_CATEGORIES.find(c => c.slug === slug);
            if (!cat) {
                await sendTextMessage(from, '❌ Invalid category.');
                return;
            }
            await db.merchant.update({ where: { id: merchant.id }, data: { store_category: slug } as any });
            await logAudit({
                actorWaId: from,
                action: 'MERCHANT_CATEGORY_UPDATED',
                entityType: 'MERCHANT',
                entityId: merchant.id,
                metadata: { store_category: slug }
            });
            await sendTextMessage(from, `✅ Store category set to *${cat.emoji} ${cat.label}*!`);
            await handleSettingsActions(from, 's_profile', session, merchant);
            return;
        }

        // Owners & invites
        if (input === 's_owners') {
            if (ownerRole === MerchantOwnerRole.STAFF) {
                await sendTextMessage(from, '⛔ You do not have permission to manage owners.');
                return;
            }

            const [owners, invites] = await Promise.all([
                db.merchantOwner.findMany({
                    where: { merchant_id: merchant.id, is_active: true },
                    orderBy: { createdAt: 'asc' }
                }),
                db.merchantInvite.findMany({
                    where: { merchant_id: merchant.id, status: 'PENDING' },
                    orderBy: { createdAt: 'desc' }
                })
            ]);

            let msg = '👥 *Owners*\n\n';
            owners.forEach((entry: any, index: number) => {
                msg += `${index + 1}. ${entry.wa_id} • ${entry.role}\n`;
            });

            if (invites.length > 0) {
                msg += '\nPending Invites:\n';
                invites.forEach((invite: any) => {
                    msg += `• ${invite.invited_wa_id} • ${invite.role}\n`;
                });
            }

            await sendButtons(from, msg, [
                { id: 's_owner_invite', title: '➕ Invite' },
                { id: 's_owner_remove', title: '🗑️ Remove' },
                { id: 's_profile', title: '⬅️ Back' }
            ]);
            return;
        }

        if (input === 's_owner_invite') {
            if (ownerRole === MerchantOwnerRole.STAFF) {
                await sendTextMessage(from, '⛔ You do not have permission to invite owners.');
                return;
            }
            await setState(from, STATE.OWNER_INVITE);
            await sendTextMessage(
                from,
                '👥 Enter the WhatsApp number to invite (E.164 format, e.g. +15551234567).'
            );
            return;
        }

        if (state === STATE.OWNER_INVITE) {
            const invitee = input.trim();
            if (!isValidPhoneNumber(invitee)) {
                await sendTextMessage(from, '⚠️ Enter a valid phone number in E.164 format.');
                return;
            }

            const shortCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const invite = await db.merchantInvite.upsert({
                where: { merchant_id_invited_wa_id: { merchant_id: merchant.id, invited_wa_id: invitee } },
                update: { status: 'PENDING', role: MerchantOwnerRole.ADMIN, invited_by_wa_id: from, short_code: shortCode } as any,
                create: {
                    merchant_id: merchant.id,
                    invited_wa_id: invitee,
                    invited_by_wa_id: from,
                    role: MerchantOwnerRole.ADMIN,
                    short_code: shortCode
                } as any
            });

            await logInviteAdded(from, invitee, { merchant_id: merchant.id, invite_id: invite.id });

            try {
                await sendButtons(
                    invitee,
                    `👋 You have been invited to manage *${merchant.trading_name}*.\n\nAccept this invite?`,
                    [
                        { id: `accept_invite_${invite.id}`, title: '✅ Accept' },
                        { id: `decline_invite_${invite.id}`, title: '❌ Decline' }
                    ]
                );
            } catch {
                // Silently continue — fallback code shown below
            }

            await clearState(from);
            await sendTextMessage(
                from,
                `✅ Invite sent to ${invitee}.\n\n` +
                `If they don't receive it, share this:\n_"Message Omeru and type: *JOIN ${shortCode}*"_`
            );
            await handleSettingsActions(from, 's_owners', session, merchant);
            return;
        }

        if (input === 's_owner_remove') {
            if (ownerRole !== MerchantOwnerRole.OWNER) {
                await sendTextMessage(from, '⛔ Only owners can remove other owners.');
                return;
            }
            await setState(from, STATE.OWNER_REMOVE);
            await sendTextMessage(from, '🗑️ Enter the WhatsApp number to remove from owners.');
            return;
        }

        if (state === STATE.OWNER_REMOVE) {
            const removeId = input.trim();
            if (!isValidPhoneNumber(removeId)) {
                await sendTextMessage(from, '⚠️ Enter a valid phone number in E.164 format.');
                return;
            }
            if (removeId === from) {
                await sendTextMessage(from, '⚠️ You cannot remove yourself.');
                return;
            }

            const ownerRecord = await db.merchantOwner.findUnique({
                where: { merchant_id_wa_id: { merchant_id: merchant.id, wa_id: removeId } }
            });
            if (!ownerRecord || !ownerRecord.is_active) {
                await sendTextMessage(from, '⚠️ Owner not found.');
                return;
            }

            await db.merchantOwner.update({
                where: { merchant_id_wa_id: { merchant_id: merchant.id, wa_id: removeId } },
                data: { is_active: false }
            });
            await logInviteRevoked(from, removeId, { merchant_id: merchant.id });
            await clearState(from);
            await sendTextMessage(from, `🗑️ ${removeId} removed from owners.`);
            await handleSettingsActions(from, 's_owners', session, merchant);
            return;
        }

        // Toggle Open/Close
        if (input === 's_toggle') {
            const updated = await db.merchant.update({ 
                where: { id: merchant.id }, 
                data: { manual_closed: !merchant.manual_closed } 
            });
            await sendTextMessage(from, `🚦 Shop is now ${updated.manual_closed ? '*CLOSED* 🔴' : '*OPEN* 🟢'}`);
            await handleSettingsActions(from, 'm_settings', session, updated);
            return;
        }

        // Hours Menu
        if (input === 's_hours') {
            const mf = formatHours(merchant.open_time, merchant.close_time);
            const sat = formatHours(merchant.sat_open_time, merchant.sat_close_time);
            
            await sendButtons(from, 
                `⏰ *Trading Hours*\n\nMon-Fri: ${mf}\nSat: ${sat}\nSun: ${merchant.sun_open ? 'Open' : 'Closed'}`,
                [
                    { id: 'h_default', title: '✅ Standard Hours' },
                    { id: 'h_mf', title: '✏️ Mon-Fri' },
                    { id: 'h_sat', title: '✏️ Saturday' }
                ]
            );
            await sendButtons(from, 'More:', [
                { id: 'h_sun', title: `☀️ Sun (${merchant.sun_open ? 'On' : 'Off'})` },
                { id: 's_back', title: '⬅️ Back' }
            ]);
            return;
        }

        if (input === 'h_default') {
            await db.merchant.update({ 
                where: { id: merchant.id }, 
                data: { open_time: '09:00', close_time: '17:00', sat_open_time: '10:00', sat_close_time: '15:00', sun_open: false } 
            });
            await sendTextMessage(from, '✅ Standard hours set.');
            const updated = await db.merchant.findUnique({ where: { id: merchant.id } });
            await handleSettingsActions(from, 's_hours', session, updated!);
            return;
        }

        if (input === 'h_mf') {
            await setState(from, STATE.HOURS_MF);
            await sendTextMessage(from, '⏰ Enter Mon-Fri hours:\n\n*HH:MM - HH:MM*\n\nExample: 08:30 - 17:00\nOr type "closed"');
            return;
        }

        if (input === 'h_sat') {
            await setState(from, STATE.HOURS_SAT);
            await sendTextMessage(from, '⏰ Enter Saturday hours:\n\n*HH:MM - HH:MM*\n\nOr type "closed"');
            return;
        }

        if (input === 'h_sun') {
            const updated = await db.merchant.update({ where: { id: merchant.id }, data: { sun_open: !merchant.sun_open } });
            await sendTextMessage(from, `✅ Sunday is now ${updated.sun_open ? 'OPEN' : 'CLOSED'}`);
            await handleSettingsActions(from, 's_hours', session, updated);
            return;
        }

        if (state === STATE.HOURS_MF || state === STATE.HOURS_SAT) {
            const isSat = state === STATE.HOURS_SAT;
            
            if (input.toLowerCase() === 'closed') {
                const data = isSat 
                    ? { sat_open_time: '00:00', sat_close_time: '00:00' }
                    : { open_time: '00:00', close_time: '00:00' };
                await db.merchant.update({ where: { id: merchant.id }, data });
            } else if (input.includes('-')) {
                const [open, close] = input.split('-').map(s => s.trim());
                const data = isSat 
                    ? { sat_open_time: open, sat_close_time: close }
                    : { open_time: open, close_time: close };
                await db.merchant.update({ where: { id: merchant.id }, data });
            } else {
                await sendTextMessage(from, '⚠️ Use format: HH:MM - HH:MM');
                return;
            }
            
            await clearState(from);
            await sendTextMessage(from, '✅ Hours updated!');
            const updated = await db.merchant.findUnique({ where: { id: merchant.id } });
            await handleSettingsActions(from, 's_hours', session, updated!);
            return;
        }

        // Fallback
        await handleSettingsActions(from, 'm_settings', session, merchant);

    } catch (error: any) {
        console.error(`❌ Settings Error: ${error.message}`);
        await clearState(from);
        await sendTextMessage(from, '❌ Error occurred.');
    }
};

const setState = async (from: string, state: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: state } });
};

const clearState = async (from: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
};

const formatHours = (open: string | null, close: string | null): string => {
    if (!open || !close || (open === '00:00' && close === '00:00')) return 'Closed';
    return `${open} - ${close}`;
};

const isValidCurrencyCode = (value: string): boolean => /^[A-Z]{3}$/.test(value);

const isValidPhoneNumber = (value: string): boolean => /^\+[1-9]\d{7,14}$/.test(value);

const isValidLocale = (value: string): boolean => /^[a-z]{2}(-[A-Z]{2})?$/.test(value);

const upsertBranding = async (
    merchantId: string,
    data: { logo_url?: string | null; currency?: string | null; locale?: string | null }
): Promise<void> => {
    await db.merchantBranding.upsert({
        where: { merchant_id: merchantId },
        update: data,
        create: { merchant_id: merchantId, ...data }
    });
};
