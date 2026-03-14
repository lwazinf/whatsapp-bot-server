import { MerchantStatus } from '@prisma/client';
import { sendButtons, sendTextMessage, sendListMessage } from './sender';
import { db } from '../../lib/db';
import { log, AuditAction } from './auditLog';

const PAGE = 8;

const STATE = {
    INVITE_NAME: 'PA_INVITE_NAME',
    INVITE_OWNER: 'PA_INVITE_OWNER',
    REVOKE_STORE: 'PA_REVOKE_STORE',
    REVOKE_OWNER: 'PA_REVOKE_OWNER'
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

        const [active, onboarding, pending] = await Promise.all([
            db.merchant.count({ where: { status: MerchantStatus.ACTIVE } }),
            db.merchant.count({ where: { status: MerchantStatus.ONBOARDING } }),
            db.merchantInvite.count({ where: { status: 'PENDING' } })
        ]);

        await sendButtons(from,
            `🛡️ *Platform Admin*\n\n🟢 Active stores: ${active}\n🟡 Onboarding: ${onboarding}\n📨 Pending invites: ${pending}`,
            [
                { id: 'pa_invite', title: '➕ Invite Store' },
                { id: 'pa_stores', title: '🏪 Stores' },
                { id: 'pa_invite_history', title: '📋 Invite History' }
            ]
        );
        await sendButtons(from, '⚙️ More:', [
            { id: 'pa_feedback', title: '💬 Feedback Inbox' },
            { id: 'pa_revoke', title: '🗑️ Revoke Access' }
        ]);
        return;
    }

    // ── Invite new store ────────────────────────────────────────────────────
    if (input === 'pa_invite') {
        await setState(from, STATE.INVITE_NAME, null);
        await sendTextMessage(from,
            '🏪 *Invite a New Store*\n\n' +
            'Enter the store name. Optionally add a custom handle with "|".\n\n' +
            'Examples:\n• `BBQ Place`\n• `BBQ Place | bbqplace_ct`'
        );
        return;
    }

    if (state === STATE.INVITE_NAME) {
        const { name, handle } = parseStoreInput(input);
        if (!name || name.length < 3) {
            await sendTextMessage(from, '⚠️ Enter a valid store name (3+ characters).');
            return;
        }
        await setState(from, STATE.INVITE_OWNER, { name, handle });
        await sendTextMessage(from, `✅ Store: *${name}*\n\n📞 Now enter the owner's WhatsApp number in E.164 format:\n_Example: +27741234567_`);
        return;
    }

    if (state === STATE.INVITE_OWNER) {
        const ownerWaId = input.trim();
        if (!isValidPhoneNumber(ownerWaId)) {
            await sendTextMessage(from, '⚠️ Enter a valid phone number in E.164 format (e.g. +27741234567).');
            return;
        }
        const name = payload?.name;
        if (!name) {
            await clearState(from);
            await sendTextMessage(from, '⚠️ Session expired. Start again with *admin*.');
            return;
        }

        const existingActive = await db.merchant.findFirst({ where: { wa_id: ownerWaId, status: MerchantStatus.ACTIVE } });
        if (existingActive) {
            await clearState(from);
            await sendTextMessage(from, `⚠️ ${ownerWaId} already owns an active store (*${existingActive.trading_name}*).`);
            return;
        }

        // Check for handle conflict if admin specified a custom handle
        if (payload?.handle) {
            const existingHandle = await db.merchant.findFirst({ where: { handle: payload.handle } });
            if (existingHandle) {
                await clearState(from);
                await sendTextMessage(from, `⚠️ Handle *@${payload.handle}* is already in use. Please start again and choose a different handle.`);
                return;
            }
        }

        const handle = await generateHandle(payload?.handle || name);
        const adminHandle = await generateAdminHandle(handle);
        const shortCode = generateShortCode();

        const merchant = await db.merchant.upsert({
            where: { wa_id: ownerWaId },
            update: { trading_name: name, handle, admin_handle: adminHandle, status: MerchantStatus.ONBOARDING },
            create: { wa_id: ownerWaId, trading_name: name, handle, admin_handle: adminHandle, status: MerchantStatus.ONBOARDING }
        });

        const invite = await db.merchantInvite.upsert({
            where: { merchant_id_invited_wa_id: { merchant_id: merchant.id, invited_wa_id: ownerWaId } },
            update: { status: 'PENDING', invited_by_wa_id: from, role: 'OWNER', revoked_at: null, short_code: shortCode } as any,
            create: { merchant_id: merchant.id, invited_wa_id: ownerWaId, invited_by_wa_id: from, role: 'OWNER', short_code: shortCode } as any
        });

        // Try to send WhatsApp invite (works if they have chatted before)
        try {
            await sendButtons(ownerWaId,
                `👋 You've been invited to manage *${merchant.trading_name}* on Omeru.\n\nAccept to begin setting up your store.`,
                [
                    { id: `accept_invite_${invite.id}`, title: '✅ Accept' },
                    { id: `decline_invite_${invite.id}`, title: '❌ Decline' }
                ]
            );
        } catch { /* silent — fallback code shown below */ }

        await log(AuditAction.INVITE_SENT, from, 'Merchant', merchant.id, {
            merchant_name: name, owner_wa_id: ownerWaId, handle: merchant.handle, short_code: shortCode
        });
        await clearState(from);
        await sendTextMessage(from,
            `✅ *Invite created!*\n\n` +
            `🏪 ${merchant.trading_name}\n` +
            `📱 @${merchant.handle}\n` +
            `🔐 Admin handle: @${adminHandle}\n\n` +
            `If ${ownerWaId} didn't receive the WhatsApp message, share this:\n\n` +
            `➡️ *"Message the Omeru bot and type: JOIN ${shortCode}"*`
        );
        await sendButtons(from, 'Quick actions:', [
            { id: `pa_store_${merchant.id}`, title: '🏪 View Store' },
            { id: 'pa_invite', title: '➕ Invite Another' },
            { id: 'pa_menu', title: '🛡️ Admin Menu' }
        ]);
        return;
    }

    // ── Store list (paginated) ──────────────────────────────────────────────
    if (input === 'pa_stores' || input.startsWith('pa_stores_p')) {
        const page = input === 'pa_stores' ? 1 : (parseInt(input.replace('pa_stores_p', ''), 10) || 1);
        const skip = (page - 1) * PAGE;

        const [merchants, total] = await Promise.all([
            db.merchant.findMany({
                orderBy: [{ status: 'asc' }, { trading_name: 'asc' }],
                take: PAGE,
                skip
            }),
            db.merchant.count()
        ]);

        if (total === 0) {
            await sendTextMessage(from, '🏪 No stores registered yet.');
            return;
        }

        const totalPages = Math.ceil(total / PAGE);
        const statusIcon = (s: string) => s === 'ACTIVE' ? '🟢' : s === 'ONBOARDING' ? '🟡' : '🔴';

        const rows = merchants.map((m: any) => ({
            id: `pa_store_${m.id}`,
            title: m.trading_name.substring(0, 24),
            description: `${statusIcon(m.status)} ${m.status} • @${m.handle}`
        }));

        await sendListMessage(
            from,
            `🏪 *All Stores* (${total} total${totalPages > 1 ? ` • Page ${page}/${totalPages}` : ''})`,
            '🏪 Select Store',
            [{ title: 'Stores', rows }]
        );

        const navBtns: Array<{ id: string; title: string }> = [];
        if (page > 1) navBtns.push({ id: `pa_stores_p${page - 1}`, title: `◀ Prev (${page - 1}|${totalPages})` });
        if (page < totalPages) navBtns.push({ id: `pa_stores_p${page + 1}`, title: `Next (${page + 1}|${totalPages}) ▶` });
        navBtns.push({ id: 'pa_menu', title: '🛡️ Admin Menu' });
        await sendButtons(from, 'Navigate:', navBtns.slice(0, 3));
        return;
    }

    // ── Store detail ────────────────────────────────────────────────────────
    if (input.startsWith('pa_store_') && !input.startsWith('pa_store_admins_') && !input.startsWith('pa_store_invites_')) {
        const merchantId = input.replace('pa_store_', '');
        const merchant = await db.merchant.findUnique({
            where: { id: merchantId },
            include: { owners: { where: { is_active: true } } }
        });
        if (!merchant) { await sendTextMessage(from, '❌ Store not found.'); return; }

        const statusIcon = merchant.status === MerchantStatus.ACTIVE ? '🟢' : merchant.status === MerchantStatus.ONBOARDING ? '🟡' : '🔴';
        const browseStatus = (merchant as any).show_in_browse ? '👁️ Visible' : '🙈 Hidden';
        const adminCount = merchant.owners.length;

        const pendingInvites = await db.merchantInvite.count({
            where: { merchant_id: merchantId, status: 'PENDING' }
        });

        let msg = `🏪 *${merchant.trading_name}*\n`;
        msg += `📱 @${merchant.handle}  🔐 @${merchant.admin_handle}\n`;
        msg += `${statusIcon} ${merchant.status}  •  Browse: ${browseStatus}\n`;
        msg += `👥 ${adminCount} admin${adminCount !== 1 ? 's' : ''}`;
        if (pendingInvites > 0) msg += `  •  📨 ${pendingInvites} pending invite${pendingInvites !== 1 ? 's' : ''}`;
        if (merchant.description) msg += `\n\n📝 ${merchant.description.substring(0, 80)}`;

        const statusButton = merchant.status === MerchantStatus.ONBOARDING
            ? { id: `pa_activate_${merchantId}`, title: '🟢 Activate Store' }
            : merchant.status === MerchantStatus.SUSPENDED
                ? { id: `pa_suspend_${merchantId}`, title: '🟢 Unsuspend' }
                : { id: `pa_suspend_${merchantId}`, title: '🔴 Suspend' };
        await sendButtons(from, msg, [
            { id: `pa_store_admins_${merchantId}`, title: '👥 Admins' },
            { id: `pa_store_invites_${merchantId}`, title: '📨 Invites' },
            statusButton
        ]);
        await sendButtons(from, 'Nav:', [
            { id: 'pa_stores', title: '⬅️ Stores' },
            { id: `pa_override_${merchantId}`, title: '🔧 Override Status' },
            { id: 'pa_menu', title: '🛡️ Admin Menu' }
        ]);
        return;
    }

    // ── Override store status (admin force-set) ────────────────────────────────
    if (input.startsWith('pa_override_') && !input.startsWith('pa_override_set_') && !input.startsWith('pa_override_confirm_')) {
        const merchantId = input.replace('pa_override_', '');
        const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant) { await sendTextMessage(from, '❌ Store not found.'); return; }

        const rows = [
            { id: `pa_override_set_${merchantId}_ONBOARDING`, title: '🟡 Set ONBOARDING', description: 'Revert store to onboarding state' },
            { id: `pa_override_set_${merchantId}_ACTIVE`,     title: '🟢 Set ACTIVE',     description: 'Force-activate store immediately' },
            { id: `pa_override_set_${merchantId}_SUSPENDED`,  title: '🔴 Set SUSPENDED',  description: 'Suspend store (hides from customers)' }
        ];
        await sendListMessage(from,
            `🔧 *Override Status — ${merchant.trading_name}*\n\nCurrent: ${merchant.status}\n\nSelect new status:`,
            '🔧 Select Status',
            [{ title: 'Status Options', rows }]
        );
        await sendButtons(from, 'Nav:', [{ id: `pa_store_${merchantId}`, title: '⬅️ Back' }]);
        return;
    }

    if (input.startsWith('pa_override_set_')) {
        const rest = input.replace('pa_override_set_', '');
        const lastUnderscore = rest.lastIndexOf('_');
        const merchantId = rest.substring(0, lastUnderscore);
        const newStatus = rest.substring(lastUnderscore + 1) as MerchantStatus;
        const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant) { await sendTextMessage(from, '❌ Store not found.'); return; }

        await sendButtons(from,
            `🔧 *Confirm Override*\n\n🏪 ${merchant.trading_name}\n📊 ${merchant.status} → *${newStatus}*\n\nThis is logged for compliance.`,
            [
                { id: `pa_override_confirm_${merchantId}_${newStatus}`, title: '✅ Confirm Override' },
                { id: `pa_store_${merchantId}`, title: '❌ Cancel' }
            ]
        );
        return;
    }

    if (input.startsWith('pa_override_confirm_')) {
        const rest = input.replace('pa_override_confirm_', '');
        const lastUnderscore = rest.lastIndexOf('_');
        const merchantId = rest.substring(0, lastUnderscore);
        const newStatus = rest.substring(lastUnderscore + 1) as MerchantStatus;
        const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant) { await sendTextMessage(from, '❌ Store not found.'); return; }

        const prevStatus = merchant.status;
        await db.merchant.update({ where: { id: merchantId }, data: { status: newStatus } });
        await log(AuditAction.ADMIN_STATUS_OVERRIDE, from, 'Merchant', merchantId, {
            merchant_name: merchant.trading_name, handle: merchant.handle,
            prev_status: prevStatus, new_status: newStatus, admin_wa_id: from
        });

        // Notify merchant of significant changes
        if (newStatus === MerchantStatus.ACTIVE && prevStatus !== MerchantStatus.ACTIVE) {
            await sendTextMessage(merchant.wa_id, `🎉 Your store *${merchant.trading_name}* has been activated by the platform admin. Type *menu* to access your dashboard.`);
        } else if (newStatus === MerchantStatus.SUSPENDED) {
            await sendTextMessage(merchant.wa_id, `⚠️ Your store *${merchant.trading_name}* has been suspended by the platform admin. Contact support for more information.`);
        }

        await sendTextMessage(from, `✅ *${merchant.trading_name}* status changed: ${prevStatus} → *${newStatus}*. Logged.`);
        await handlePlatformAdminActions(from, `pa_store_${merchantId}`);
        return;
    }

    // ── Activate store (ONBOARDING → ACTIVE) ───────────────────────────────────
    if (input.startsWith('pa_activate_')) {
        const merchantId = input.replace('pa_activate_', '');
        const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant) { await sendTextMessage(from, '❌ Store not found.'); return; }
        if (merchant.status !== MerchantStatus.ONBOARDING) {
            await sendTextMessage(from, '⚠️ Store is not in ONBOARDING status.');
            await handlePlatformAdminActions(from, `pa_store_${merchantId}`);
            return;
        }
        await db.merchant.update({ where: { id: merchantId }, data: { status: MerchantStatus.ACTIVE } });
        await log(AuditAction.ADMIN_STORE_ACTIVATED, from, 'Merchant', merchantId, {
            merchant_name: merchant.trading_name, handle: merchant.handle, admin_wa_id: from
        });
        await sendTextMessage(merchant.wa_id, `🎉 Your store *${merchant.trading_name}* is now LIVE on Omeru! Type *menu* to access your dashboard.`);
        await sendTextMessage(from, `🟢 *${merchant.trading_name}* is now ACTIVE.`);
        await handlePlatformAdminActions(from, `pa_store_${merchantId}`);
        return;
    }

    // ── Suspend / Unsuspend ─────────────────────────────────────────────────
    if (input.startsWith('pa_suspend_')) {
        const merchantId = input.replace('pa_suspend_', '');
        const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant) { await sendTextMessage(from, '❌ Store not found.'); return; }
        const newStatus = merchant.status === MerchantStatus.SUSPENDED ? MerchantStatus.ACTIVE : MerchantStatus.SUSPENDED;
        await db.merchant.update({ where: { id: merchantId }, data: { status: newStatus } });
        const suspendAction = newStatus === MerchantStatus.SUSPENDED ? AuditAction.ADMIN_STORE_SUSPENDED : AuditAction.ADMIN_STORE_UNSUSPENDED;
        await log(suspendAction, from, 'Merchant', merchantId, {
            merchant_name: merchant.trading_name, handle: merchant.handle, admin_wa_id: from
        });
        if (newStatus === MerchantStatus.SUSPENDED) {
            await sendTextMessage(merchant.wa_id, `⚠️ Your store *${merchant.trading_name}* has been suspended by the platform admin. Contact support for more information.`);
        }
        await sendTextMessage(from, `${newStatus === MerchantStatus.ACTIVE ? '🟢' : '🔴'} *${merchant.trading_name}* is now ${newStatus}.`);
        await handlePlatformAdminActions(from, `pa_store_${merchantId}`);
        return;
    }

    // ── Store admins list (tappable to revoke) ──────────────────────────────
    if (input.startsWith('pa_store_admins_')) {
        const merchantId = input.replace('pa_store_admins_', '');
        const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant) { await sendTextMessage(from, '❌ Store not found.'); return; }

        const owners = await db.merchantOwner.findMany({
            where: { merchant_id: merchantId, is_active: true },
            orderBy: { createdAt: 'asc' }
        });

        if (owners.length === 0) {
            await sendTextMessage(from, `👥 *${merchant.trading_name}* has no active admins.`);
            await sendButtons(from, 'Nav:', [{ id: `pa_store_${merchantId}`, title: '⬅️ Back' }]);
            return;
        }

        const rows = owners.map((o: any) => ({
            id: `pa_revoke_confirm_${merchantId}_${o.wa_id}`,
            title: o.wa_id.substring(0, 24),
            description: `${o.role} — tap to revoke`
        }));

        await sendListMessage(
            from,
            `👥 *${merchant.trading_name}* Admins (${owners.length})\n\nTap an admin to revoke their access:`,
            '👥 Select Admin',
            [{ title: 'Active Admins', rows }]
        );
        await sendButtons(from, 'Nav:', [{ id: `pa_store_${merchantId}`, title: '⬅️ Back' }]);
        return;
    }

    // ── Revoke confirm (shown after tapping an admin) ───────────────────────
    if (input.startsWith('pa_revoke_confirm_')) {
        const rest = input.replace('pa_revoke_confirm_', '');
        const sepIdx = rest.indexOf('_');
        const merchantId = rest.substring(0, sepIdx);
        const targetWaId = rest.substring(sepIdx + 1);

        const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
        const owner = await db.merchantOwner.findUnique({
            where: { merchant_id_wa_id: { merchant_id: merchantId, wa_id: targetWaId } }
        });
        if (!merchant || !owner) { await sendTextMessage(from, '❌ Not found.'); return; }

        await sendButtons(from,
            `⚠️ *Revoke access?*\n\n👤 ${targetWaId}\n🏪 ${merchant.trading_name}\n🔑 Role: ${owner.role}`,
            [
                { id: `pa_revoke_do_${merchantId}_${targetWaId}`, title: '🗑️ Yes, Revoke' },
                { id: `pa_store_admins_${merchantId}`, title: '❌ Cancel' }
            ]
        );
        return;
    }

    // ── Actually revoke ─────────────────────────────────────────────────────
    if (input.startsWith('pa_revoke_do_')) {
        const rest = input.replace('pa_revoke_do_', '');
        const sepIdx = rest.indexOf('_');
        const merchantId = rest.substring(0, sepIdx);
        const targetWaId = rest.substring(sepIdx + 1);

        const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant) { await sendTextMessage(from, '❌ Store not found.'); return; }

        await db.merchantOwner.updateMany({
            where: { merchant_id: merchantId, wa_id: targetWaId },
            data: { is_active: false }
        });
        await db.merchantInvite.updateMany({
            where: { merchant_id: merchantId, invited_wa_id: targetWaId, status: 'PENDING' },
            data: { status: 'REVOKED', revoked_at: new Date() }
        });
        await log(AuditAction.ADMIN_ACCESS_REVOKED, from, 'MerchantOwner', `${merchantId}_${targetWaId}`, {
            merchant_name: merchant.trading_name, revoked_wa_id: targetWaId, admin_wa_id: from
        });

        await sendTextMessage(from, `✅ Access revoked for ${targetWaId} on *${merchant.trading_name}*.`);
        await handlePlatformAdminActions(from, `pa_store_admins_${merchantId}`);
        return;
    }

    // ── Store invites list ──────────────────────────────────────────────────
    if (input.startsWith('pa_store_invites_')) {
        const merchantId = input.replace('pa_store_invites_', '');
        const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant) { await sendTextMessage(from, '❌ Store not found.'); return; }

        const invites = await db.merchantInvite.findMany({
            where: { merchant_id: merchantId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        if (invites.length === 0) {
            await sendTextMessage(from, `📨 No invites found for *${merchant.trading_name}*.`);
            await sendButtons(from, 'Nav:', [{ id: `pa_store_${merchantId}`, title: '⬅️ Back' }]);
            return;
        }

        const statusIcon = (s: string) => s === 'ACCEPTED' ? '✅' : s === 'REVOKED' ? '❌' : '🕐';
        let msg = `📨 *${merchant.trading_name}* — Invites\n\n`;
        invites.forEach((inv: any) => {
            msg += `${statusIcon(inv.status)} ${inv.invited_wa_id} (${inv.role})\n`;
            msg += `   📅 ${inv.createdAt.toLocaleDateString()} • ${inv.status}\n`;
            if (inv.status === 'PENDING' && (inv as any).short_code) {
                msg += `   🔑 Code: JOIN ${(inv as any).short_code}\n`;
            }
            msg += '\n';
        });

        await sendTextMessage(from, msg.trim());

        // Show resend buttons for pending invites
        const pending = invites.filter((i: any) => i.status === 'PENDING');
        if (pending.length > 0) {
            const btns = pending.slice(0, 3).map((i: any) => ({
                id: `pa_resend_${i.id}`,
                title: `🔄 Resend to ${i.invited_wa_id.slice(-6)}`
            }));
            await sendButtons(from, '📨 Resend a pending invite:', btns);
        }

        await sendButtons(from, 'Nav:', [{ id: `pa_store_${merchantId}`, title: '⬅️ Back' }]);
        return;
    }

    // ── Resend an invite ────────────────────────────────────────────────────
    if (input.startsWith('pa_resend_')) {
        const inviteId = input.replace('pa_resend_', '');
        const invite = await db.merchantInvite.findUnique({
            where: { id: inviteId },
            include: { merchant: true }
        });
        if (!invite || invite.status !== 'PENDING') {
            await sendTextMessage(from, '⚠️ Invite not found or no longer pending.');
            return;
        }

        const merchantName = (invite as any).merchant?.trading_name || 'the store';
        const shortCode = (invite as any).short_code;

        try {
            await sendButtons(invite.invited_wa_id,
                `👋 Reminder: You've been invited to manage *${merchantName}* on Omeru.\n\nAccept to begin onboarding.`,
                [
                    { id: `accept_invite_${invite.id}`, title: '✅ Accept' },
                    { id: `decline_invite_${invite.id}`, title: '❌ Decline' }
                ]
            );
        } catch { /* silent */ }

        await sendTextMessage(from,
            `✅ Invite resent to ${invite.invited_wa_id}.\n\n` +
            (shortCode ? `🔑 Share code if needed: *JOIN ${shortCode}*` : '')
        );
        return;
    }

    // ── Invite history (all stores, paginated) ──────────────────────────────
    if (input === 'pa_invite_history' || input.startsWith('pa_invite_history_p')) {
        const page = input === 'pa_invite_history' ? 1 : (parseInt(input.replace('pa_invite_history_p', ''), 10) || 1);
        const skip = (page - 1) * PAGE;

        const [invites, total] = await Promise.all([
            db.merchantInvite.findMany({
                orderBy: { createdAt: 'desc' },
                take: PAGE,
                skip,
                include: { merchant: true }
            }),
            db.merchantInvite.count()
        ]);

        if (total === 0) {
            await sendTextMessage(from, '📋 No invite history yet.');
            return;
        }

        const totalPages = Math.ceil(total / PAGE);
        const statusIcon = (s: string) => s === 'ACCEPTED' ? '✅' : s === 'REVOKED' ? '❌' : '🕐';

        let msg = `📋 *Invite History* (Page ${page}/${totalPages})\n\n`;
        invites.forEach((inv: any) => {
            msg += `${statusIcon(inv.status)} *${inv.merchant?.trading_name || '?'}*\n`;
            msg += `   👤 ${inv.invited_wa_id} • ${inv.role}\n`;
            msg += `   📅 ${inv.createdAt.toLocaleDateString()}\n`;
            if (inv.status === 'PENDING' && inv.short_code) msg += `   🔑 JOIN ${inv.short_code}\n`;
            msg += '\n';
        });

        await sendTextMessage(from, msg.trim());

        const navBtns: Array<{ id: string; title: string }> = [];
        if (page > 1) navBtns.push({ id: `pa_invite_history_p${page - 1}`, title: `◀ Prev (${page - 1}|${totalPages})` });
        if (page < totalPages) navBtns.push({ id: `pa_invite_history_p${page + 1}`, title: `Next (${page + 1}|${totalPages}) ▶` });
        navBtns.push({ id: 'pa_menu', title: '🛡️ Admin Menu' });
        await sendButtons(from, 'Navigate:', navBtns.slice(0, 3));
        return;
    }

    // ── Legacy text-based revoke (kept for backwards compat) ───────────────
    if (input === 'pa_revoke') {
        await setState(from, STATE.REVOKE_STORE, null);
        await sendTextMessage(from,
            '🗑️ *Revoke Store Access*\n\n' +
            'Enter the store admin handle (e.g. @bbqplace_admin).\n\n' +
            '_Tip: Use *pa_stores* → tap a store → Admins for a simpler flow._'
        );
        return;
    }

    if (state === STATE.REVOKE_STORE) {
        const adminHandle = input.replace('@', '').trim().toLowerCase();
        if (!adminHandle.endsWith('_admin')) {
            await sendTextMessage(from, '⚠️ Handle must end in _admin (e.g. @bbqplace_admin).');
            return;
        }
        await setState(from, STATE.REVOKE_OWNER, { adminHandle });
        await sendTextMessage(from, '📞 Enter the WhatsApp number to revoke (E.164, e.g. +27741234567):');
        return;
    }

    if (state === STATE.REVOKE_OWNER) {
        const ownerWaId = input.trim();
        if (!isValidPhoneNumber(ownerWaId)) {
            await sendTextMessage(from, '⚠️ Enter a valid E.164 phone number.');
            return;
        }
        const adminHandle = payload?.adminHandle;
        if (!adminHandle) { await clearState(from); await sendTextMessage(from, '⚠️ Session expired.'); return; }

        const merchant = await db.merchant.findFirst({ where: { admin_handle: adminHandle } });
        if (!merchant) { await sendTextMessage(from, '❌ Store not found.'); return; }

        await db.merchantOwner.updateMany({ where: { merchant_id: merchant.id, wa_id: ownerWaId }, data: { is_active: false } });
        await db.merchantInvite.updateMany({
            where: { merchant_id: merchant.id, invited_wa_id: ownerWaId, status: 'PENDING' },
            data: { status: 'REVOKED', revoked_at: new Date() }
        });

        await clearState(from);
        await sendTextMessage(from, `✅ Access revoked for ${ownerWaId} on @${adminHandle}.`);
        return;
    }

    // ── Feedback inbox — type selector ───────────────────────────────────────
    if (input === 'pa_feedback') {
        const [merchantCount, customerCount] = await Promise.all([
            db.auditLog.count({ where: { action: 'MERCHANT_FEEDBACK' } }),
            db.auditLog.count({ where: { action: 'CUSTOMER_FEEDBACK' } })
        ]);

        await sendButtons(from,
            `💬 *Feedback Inbox*\n\nChoose which inbox to view:`,
            [
                { id: 'pa_fbm_1', title: `🏪 Merchants (${merchantCount})` },
                { id: 'pa_fbc_1', title: `👤 Customers (${customerCount})` },
                { id: 'pa_menu',  title: '🛡️ Admin Menu' }
            ]
        );
        return;
    }

    // ── Merchant feedback (pa_fbm_{page}) ────────────────────────────────────
    if (input.startsWith('pa_fbm_')) {
        const page = parseInt(input.replace('pa_fbm_', ''), 10) || 1;
        const PAGE_SIZE = 5;
        const skip = (page - 1) * PAGE_SIZE;

        const [items, total] = await Promise.all([
            db.auditLog.findMany({
                where: { action: 'MERCHANT_FEEDBACK' },
                orderBy: { createdAt: 'desc' },
                take: PAGE_SIZE,
                skip
            }),
            db.auditLog.count({ where: { action: 'MERCHANT_FEEDBACK' } })
        ]);

        if (total === 0) {
            await sendButtons(from, '📭 No merchant feedback yet.', [
                { id: 'pa_feedback', title: '⬅️ Feedback Inbox' }
            ]);
            return;
        }

        const totalPages = Math.ceil(total / PAGE_SIZE);
        let msg = `🏪 *Merchant Feedback* (${total} total)\n━━━━━━━━━━━━━━━━━━━━\n`;
        for (const item of items) {
            const meta = item.metadata_json as any;
            const date = item.createdAt.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
            msg += `\n📩 *${meta?.merchant_name ?? item.actor_wa_id}* (${date})\n${meta?.message ?? '(no text)'}\n`;
        }

        const navBtns: Array<{ id: string; title: string }> = [];
        if (page > 1) navBtns.push({ id: `pa_fbm_${page - 1}`, title: '◀ Prev' });
        if (page < totalPages) navBtns.push({ id: `pa_fbm_${page + 1}`, title: 'Next ▶' });
        navBtns.push({ id: 'pa_feedback', title: '⬅️ Back' });

        await sendButtons(from, msg, navBtns.slice(0, 3));
        return;
    }

    // ── Customer feedback (pa_fbc_{page}) ────────────────────────────────────
    if (input.startsWith('pa_fbc_')) {
        const page = parseInt(input.replace('pa_fbc_', ''), 10) || 1;
        const PAGE_SIZE = 5;
        const skip = (page - 1) * PAGE_SIZE;

        const [items, total] = await Promise.all([
            db.auditLog.findMany({
                where: { action: 'CUSTOMER_FEEDBACK' },
                orderBy: { createdAt: 'desc' },
                take: PAGE_SIZE,
                skip
            }),
            db.auditLog.count({ where: { action: 'CUSTOMER_FEEDBACK' } })
        ]);

        if (total === 0) {
            await sendButtons(from, '📭 No customer feedback yet.', [
                { id: 'pa_feedback', title: '⬅️ Feedback Inbox' }
            ]);
            return;
        }

        const totalPages = Math.ceil(total / PAGE_SIZE);
        let msg = `👤 *Customer Feedback* (${total} total)\n━━━━━━━━━━━━━━━━━━━━\n`;
        for (const item of items) {
            const meta = item.metadata_json as any;
            const date = item.createdAt.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
            msg += `\n📩 *${meta?.customer_name ?? item.actor_wa_id}* (${date})\n${meta?.message ?? '(no text)'}\n`;
        }

        const navBtns: Array<{ id: string; title: string }> = [];
        if (page > 1) navBtns.push({ id: `pa_fbc_${page - 1}`, title: '◀ Prev' });
        if (page < totalPages) navBtns.push({ id: `pa_fbc_${page + 1}`, title: 'Next ▶' });
        navBtns.push({ id: 'pa_feedback', title: '⬅️ Back' });

        await sendButtons(from, msg, navBtns.slice(0, 3));
        return;
    }
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const parseStoreInput = (value: string): { name: string; handle?: string } => {
    const [namePart, handlePart] = value.split('|').map(p => p.trim()).filter(Boolean);
    return { name: namePart || value.trim(), handle: handlePart };
};

const isValidPhoneNumber = (v: string): boolean => /^\+[1-9]\d{7,14}$/.test(v);

const generateShortCode = (): string => Math.random().toString(36).substring(2, 8).toUpperCase();

const generateHandle = async (name: string): Promise<string> => {
    let base = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
    if (base.length < 3) base = `shop${base}`;
    let handle = base; let i = 1;
    while (await db.merchant.findFirst({ where: { handle } })) handle = `${base}${i++}`;
    return handle;
};

const generateAdminHandle = async (handle: string): Promise<string> => {
    let base = `${handle}_admin`;
    let adminHandle = base; let i = 1;
    while (await db.merchant.findFirst({ where: { admin_handle: adminHandle } })) adminHandle = `${base}${i++}`;
    return adminHandle;
};

const setState = async (from: string, state: string, data: Record<string, unknown> | null) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: state, state: data ? JSON.stringify(data) : null } });
};

const clearState = async (from: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null, state: null } });
};

const getSessionPayload = async (from: string): Promise<Record<string, any> | null> => {
    const r = await db.userSession.findUnique({ where: { wa_id: from }, select: { state: true } });
    if (!r?.state) return null;
    try { return JSON.parse(r.state); } catch { return null; }
};
