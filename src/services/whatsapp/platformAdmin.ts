import { PrismaClient, MerchantStatus } from '@prisma/client';
import { sendButtons, sendTextMessage } from './sender';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

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

    if (input === 'admin' || input === 'pa_menu') {
        await clearState(from);
        await sendButtons(from, '🛡️ *Platform Admin*', [
            { id: 'pa_invite', title: '➕ Invite Store' },
            { id: 'pa_revoke', title: '🗑️ Revoke Access' }
        ]);
        return;
    }

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

        const existing = await db.merchant.findUnique({ where: { wa_id: ownerWaId } });
        if (existing && existing.status === MerchantStatus.ACTIVE) {
            await clearState(from);
            await sendTextMessage(from, '⚠️ This number already owns an active store.');
            return;
        }

        const handle = await generateHandle(payload?.handle || name);
        const adminHandle = await generateAdminHandle(handle);

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
            update: { status: 'PENDING', invited_by_wa_id: from, role: 'OWNER', revoked_at: null },
            create: {
                merchant_id: merchant.id,
                invited_wa_id: ownerWaId,
                invited_by_wa_id: from,
                role: 'OWNER'
            }
        });

        await sendButtons(
            ownerWaId,
            `👋 You have been invited to manage *${merchant.trading_name}*.\n\nAccept this invite to start onboarding.`,
            [
                { id: `accept_invite_${invite.id}`, title: '✅ Accept' },
                { id: `decline_invite_${invite.id}`, title: '❌ Decline' }
            ]
        );

        await clearState(from);
        await sendTextMessage(from, `✅ Invite sent. Admin handle: @${adminHandle}`);
        return;
    }

    if (input === 'pa_revoke') {
        await setState(from, STATE.REVOKE_STORE, null);
        await sendTextMessage(from, '🗑️ Enter the store admin handle (e.g. @bbq_admin).');
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
};

const parseStoreInput = (value: string): { name: string; handle?: string } => {
    const [namePart, handlePart] = value.split('|').map(part => part.trim()).filter(Boolean);
    return { name: namePart || value.trim(), handle: handlePart };
};

const isValidPhoneNumber = (value: string): boolean => /^\+[1-9]\d{7,14}$/.test(value);

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
    if (!base.endsWith('_admin')) {
        base = `${base}_admin`;
    }
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
