import { MerchantStatus } from '@prisma/client';
import { sendButtons, sendTextMessage, sendListMessage } from './sender';
import { db } from '../../lib/db';

const STATE = {
    INVITE_NAME: 'PA_INVITE_NAME',
    INVITE_OWNER: 'PA_INVITE_OWNER',
    REVOKE_STORE: 'PA_REVOKE_STORE',
    REVOKE_OWNER: 'PA_REVOKE_OWNER',
    REVOKE_ADMIN_STORE: 'PA_RA_STORE',
    REVOKE_ADMIN_NUM: 'PA_RA_NUM'
};

export const handlePlatformAdminActions = async (
    from: string,
    input: string
): Promise<void> => {
    const session = await db.userSession.findUnique({ where: { wa_id: from } });
    const state = session?.active_prod_id || '';
    const payload = await getSessionPayload(from);

    // ── Main menu ───────────────────────────────────────────────────────────
    if (input === 'admin' || input === 'pa_menu') {
        await clearState(from);
        await sendButtons(from, '🛡️ *Platform Admin*', [
            { id: 'pa_invite', title: '➕ Invite Store' },
            { id: 'pa_stores', title: '🏪 View Stores' },
            { id: 'pa_invite_history', title: '📋 Invite History' }
        ]);
        await sendButtons(from, 'More:', [
            { id: 'pa_revoke', title: '🗑️ Revoke Access' },
            { id: 'pa_revoke_admin', title: '👥 Revoke Admin' }
        ]);
        return;
    }

    // ── Invite store ────────────────────────────────────────────────────────
    if (input === 'pa_invite') {
        await setState(from, STATE.INVITE_NAME, null);
        await sendTextMessage(from, '🏪 Enter the store name. You can add a custom handle with "|".\n\nExample: *BBQ Place | bbqplace*');
        return;
    }

    if (state === STATE.INVITE_NAME) {
        const { name, handle } = parseStoreInput(input);
        if (!name || name.length < 3) {
            await sendTextMessage(from, '⚠️ Enter a valid store name (3+ characters).');
            return;
        }
        await setState(from, STATE.INVITE_OWNER, { name, handle });
        await sendTextMessage(from, '📞 Enter the owner WhatsApp number (E.164, e.g. +27741234567).');
        return;
    }

    if (state === STATE.INVITE_OWNER) {
        const ownerWaId = input.trim();
        if (!isValidPhoneNumber(ownerWaId)) {
            await sendTextMessage(from, '⚠️ Enter a valid phone number in E.164 format.');
            return;
        }
        const name = payload?.name;
        if (!name) {
            await clearState(from);
            await sendTextMessage(from, '⚠️ Missing store details. Start again with *admin*.');
            return;
        }

        const existingActive = await db.merchant.findFirst({
            where: { wa_id: normalizePhone(ownerWaId) }
        });
        if (existingActive && existingActive.status === MerchantStatus.ACTIVE) {
            await clearState(from);
            await sendTextMessage(from, '⚠️ This number already owns an active store.');
            return;
        }

        const handle = await generateHandle(payload?.handle || name);
        const adminHandle = await generateAdminHandle(handle);
        const shortCode = generateShortCode();

        const merchant = await db.merchant.upsert({
            where: { wa_id: ownerWaId },
            update: { trading_name: name, handle, admin_handle: adminHandle, status: MerchantStatus.ONBOARDING },
            create: {
                wa_id: ownerWaId,
                trading_name: name,
                handle,
                admin_handle: adminHandle,
                status: MerchantStatus.ONBOARDING
            }
        });

        const invite = await db.merchantInvite.upsert({
            where: { merchant_id_invited_wa_id: { merchant_id: merchant.id, invited_wa_id: ownerWaId } },
            update: { status: 'PENDING', invited_by_wa_id: from, role: 'OWNER', revoked_at: null, short_code: shortCode },
            create: {
                merchant_id: merchant.id,
                invited_wa_id: ownerWaId,
                invited_by_wa_id: from,
                role: 'OWNER',
                short_code: shortCode
            }
        });

        // Try to send WhatsApp invite (works if they've chatted with the bot before)
        try {
            await sendButtons(
                ownerWaId,
                `👋 You've been invited to manage *${merchant.trading_name}* on Omeru.\n\nAccept this invite to start setting up your store.`,
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
            `✅ *Invite sent!*\n\n` +
            `🏪 ${merchant.trading_name}\n` +
            `📱 @${merchant.handle}\n` +
            `🔐 Admin: @${adminHandle}\n\n` +
            `If ${ownerWaId} doesn't receive the WhatsApp message (first-time contact), share this:\n\n` +
            `_"Message the Omeru bot and type: *JOIN ${shortCode}*"_`
        );
        return;
    }

    // ── Revoke full access ──────────────────────────────────────────────────
    if (input === 'pa_revoke') {
        await setState(from, STATE.REVOKE_STORE, null);
        await sendTextMessage(from, '🗑️ Enter the store admin handle (e.g. @bbq_admin) to revoke access.');
        return;
    }

    if (state === STATE.REVOKE_STORE) {
        const adminHandle = input.replace('@', '').trim().toLowerCase();
        if (!adminHandle.endsWith('_admin')) {
            await sendTextMessage(from, '⚠️ Enter a valid admin handle ending in _admin.');
            return;
        }
        await setState(from, STATE.REVOKE_OWNER, { adminHandle });
        await sendTextMessage(from, '📞 Enter the owner WhatsApp number to revoke.');
        return;
    }

    if (state === STATE.REVOKE_OWNER) {
        const ownerWaId = input.trim();
        if (!isValidPhoneNumber(ownerWaId)) {
            await sendTextMessage(from, '⚠️ Enter a valid phone number in E.164 format.');
            return;
        }
        const adminHandle = payload?.adminHandle;
        if (!adminHandle) {
            await clearState(from);
            await sendTextMessage(from, '⚠️ Missing store details. Start again with *admin*.');
            return;
        }

        const merchant = await db.merchant.findFirst({ where: { admin_handle: adminHandle } });
        if (!merchant) {
            await sendTextMessage(from, '❌ Store not found.');
            return;
        }

        await db.merchantOwner.updateMany({
            where: { merchant_id: merchant.id, wa_id: ownerWaId },
            data: { is_active: false }
        });

        await db.merchantInvite.updateMany({
            where: { merchant_id: merchant.id, invited_wa_id: ownerWaId, status: 'PENDING' },
            data: { status: 'REVOKED', revoked_at: new Date() }
        });

        await clearState(from);
        await sendTextMessage(from, `✅ Access revoked for ${ownerWaId} on @${adminHandle}.`);
        return;
    }

    // ── Revoke specific admin ───────────────────────────────────────────────
    if (input === 'pa_revoke_admin') {
        await setState(from, STATE.REVOKE_ADMIN_STORE, null);
        await sendTextMessage(from, '👥 Enter the store admin handle (e.g. @bbq_admin) to revoke an admin from.');
        return;
    }

    if (state === STATE.REVOKE_ADMIN_STORE) {
        const adminHandle = input.replace('@', '').trim().toLowerCase();
        const merchant = await db.merchant.findFirst({ where: { admin_handle: adminHandle } });
        if (!merchant) {
            await sendTextMessage(from, '❌ Store not found. Check the handle and try again.');
            return;
        }
        await setState(from, STATE.REVOKE_ADMIN_NUM, { merchantId: merchant.id, storeName: merchant.trading_name });

        // Show current admins
        const owners = await db.merchantOwner.findMany({
            where: { merchant_id: merchant.id, is_active: true },
            orderBy: { createdAt: 'asc' }
        });
        let msg = `👥 *${merchant.trading_name}* Admins:\n\n`;
        owners.forEach((o: any, i: number) => { msg += `${i + 1}. ${o.wa_id} (${o.role})\n`; });
        msg += '\nEnter the WhatsApp number to revoke admin access from:';
        await sendTextMessage(from, msg);
        return;
    }

    if (state === STATE.REVOKE_ADMIN_NUM) {
        const targetWaId = input.trim();
        if (!isValidPhoneNumber(targetWaId)) {
            await sendTextMessage(from, '⚠️ Enter a valid phone number in E.164 format.');
            return;
        }
        const merchantId = payload?.merchantId;
        if (!merchantId) {
            await clearState(from);
            await sendTextMessage(from, '⚠️ Missing store info. Start again with *admin*.');
            return;
        }

        await db.merchantOwner.updateMany({
            where: { merchant_id: merchantId, wa_id: targetWaId },
            data: { is_active: false }
        });
        await db.merchantInvite.updateMany({
            where: { merchant_id: merchantId, invited_wa_id: targetWaId, status: 'PENDING' },
            data: { status: 'REVOKED', revoked_at: new Date() }
        });

        await clearState(from);
        await sendTextMessage(from, `✅ Admin access revoked for ${targetWaId} on ${payload?.storeName}.`);
        return;
    }

    // ── View all stores ─────────────────────────────────────────────────────
    if (input === 'pa_stores') {
        const [active, onboarding, suspended] = await Promise.all([
            db.merchant.findMany({ where: { status: MerchantStatus.ACTIVE }, orderBy: { trading_name: 'asc' }, take: 8 }),
            db.merchant.findMany({ where: { status: MerchantStatus.ONBOARDING }, orderBy: { createdAt: 'desc' }, take: 5 }),
            db.merchant.findMany({ where: { status: MerchantStatus.SUSPENDED }, orderBy: { updatedAt: 'desc' }, take: 4 })
        ]);

        let rows: Array<{ id: string; title: string; description: string }> = [];

        for (const m of active) {
            rows.push({ id: `pa_store_${m.id}`, title: m.trading_name.substring(0, 24), description: `🟢 ACTIVE • @${m.handle}` });
        }
        for (const m of onboarding) {
            rows.push({ id: `pa_store_${m.id}`, title: m.trading_name.substring(0, 24), description: `🟡 ONBOARDING • @${m.handle}` });
        }
        for (const m of suspended) {
            rows.push({ id: `pa_store_${m.id}`, title: m.trading_name.substring(0, 24), description: `🔴 SUSPENDED • @${m.handle}` });
        }

        if (rows.length === 0) {
            await sendTextMessage(from, '🏪 No stores found.');
            return;
        }

        await sendListMessage(from, `🏪 *All Stores* (${rows.length})`, '🏪 View Stores', [{ title: 'Stores', rows }]);
        return;
    }

    if (input.startsWith('pa_store_')) {
        const merchantId = input.replace('pa_store_', '');
        const merchant = await db.merchant.findUnique({
            where: { id: merchantId },
            include: { owners: { where: { is_active: true } } }
        });
        if (!merchant) {
            await sendTextMessage(from, '❌ Store not found.');
            return;
        }

        let msg = `🏪 *${merchant.trading_name}*\n`;
        msg += `📱 @${merchant.handle}\n`;
        msg += `🔐 Admin: @${merchant.admin_handle}\n`;
        msg += `📊 Status: ${merchant.status}\n`;
        msg += `🌐 Browse: ${merchant.show_in_browse ? 'Visible' : 'Hidden'}\n\n`;

        if (merchant.owners.length > 0) {
            msg += `👥 *Admins (${merchant.owners.length}):*\n`;
            merchant.owners.forEach((o: any) => { msg += `• ${o.wa_id} (${o.role})\n`; });
        } else {
            msg += '👥 No active admins\n';
        }

        await sendButtons(from, msg, [
            { id: `pa_suspend_${merchantId}`, title: merchant.status === MerchantStatus.SUSPENDED ? '🟢 Unsuspend' : '🔴 Suspend' },
            { id: 'pa_stores', title: '⬅️ Back' }
        ]);
        return;
    }

    if (input.startsWith('pa_suspend_')) {
        const merchantId = input.replace('pa_suspend_', '');
        const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant) {
            await sendTextMessage(from, '❌ Store not found.');
            return;
        }
        const newStatus = merchant.status === MerchantStatus.SUSPENDED ? MerchantStatus.ACTIVE : MerchantStatus.SUSPENDED;
        await db.merchant.update({ where: { id: merchantId }, data: { status: newStatus } });
        await sendTextMessage(from, `✅ *${merchant.trading_name}* is now ${newStatus === MerchantStatus.ACTIVE ? '🟢 ACTIVE' : '🔴 SUSPENDED'}.`);
        await handlePlatformAdminActions(from, `pa_store_${merchantId}`);
        return;
    }

    // ── Invite history ──────────────────────────────────────────────────────
    if (input === 'pa_invite_history') {
        const invites = await db.merchantInvite.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { merchant: true }
        });

        if (invites.length === 0) {
            await sendTextMessage(from, '📋 No invite history found.');
            return;
        }

        const statusIcon = (s: string) => s === 'ACCEPTED' ? '✅' : s === 'REVOKED' ? '❌' : '🕐';
        let msg = '📋 *Invite History* (last 10)\n\n';
        invites.forEach((inv: any) => {
            msg += `${statusIcon(inv.status)} *${inv.merchant?.trading_name || inv.merchant_id}*\n`;
            msg += `   👤 ${inv.invited_wa_id} • ${inv.role}\n`;
            msg += `   📅 ${inv.createdAt.toLocaleDateString()}\n\n`;
        });

        await sendTextMessage(from, msg);
        await sendButtons(from, 'Nav:', [{ id: 'admin', title: '🛡️ Admin Menu' }]);
        return;
    }
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const parseStoreInput = (value: string): { name: string; handle?: string } => {
    const [namePart, handlePart] = value.split('|').map(part => part.trim()).filter(Boolean);
    return { name: namePart || value.trim(), handle: handlePart };
};

const isValidPhoneNumber = (value: string): boolean => /^\+[1-9]\d{7,14}$/.test(value);

const normalizePhone = (p: string): string => p.replace(/[^\d]/g, '');

const generateShortCode = (): string => Math.random().toString(36).substring(2, 8).toUpperCase();

const generateHandle = async (name: string): Promise<string> => {
    let base = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
    if (base.length < 3) base = `shop${base}`;
    let handle = base;
    let i = 1;
    while (await db.merchant.findFirst({ where: { handle } })) {
        handle = `${base}${i++}`;
    }
    return handle;
};

const generateAdminHandle = async (handle: string): Promise<string> => {
    let base = `${handle}_admin`;
    let adminHandle = base;
    let i = 1;
    while (await db.merchant.findFirst({ where: { admin_handle: adminHandle } })) {
        adminHandle = `${base}${i++}`;
    }
    return adminHandle;
};

const setState = async (from: string, state: string, data: Record<string, unknown> | null) => {
    await db.userSession.update({
        where: { wa_id: from },
        data: { active_prod_id: state, state: data ? JSON.stringify(data) : null }
    });
};

const clearState = async (from: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null, state: null } });
};

const getSessionPayload = async (from: string): Promise<Record<string, any> | null> => {
    const current = await db.userSession.findUnique({ where: { wa_id: from }, select: { state: true } });
    if (!current?.state) return null;
    try {
        return JSON.parse(current.state);
    } catch {
        return null;
    }
};
