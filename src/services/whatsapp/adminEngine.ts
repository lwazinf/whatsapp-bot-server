import { PrismaClient, UserSession, InviteStatus } from '@prisma/client';
import { sendButtons, sendListMessage, sendTextMessage } from './sender';
import { isSameWaId, normalizeWaId } from './waId';
import { PLATFORM_ADMIN_NUMBERS, PLATFORM_NAME } from './config';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

const ADMIN_STATE = {
    ADD_OWNER: 'ADMIN_ADD_OWNER',
    REVOKE_OWNER: 'ADMIN_REVOKE_OWNER'
};

export const handleAdminAction = async (
    from: string,
    input: string,
    session: UserSession
): Promise<void> => {
    if (!isAdminNumber(from)) {
        await sendTextMessage(from, '⛔ Admin access only.');
        return;
    }

    if (input === 'admin' || input === 'admin_menu' || input === 'owners') {
        await clearAdminState(from);
        await showAdminMenu(from);
        return;
    }

    if (input === 'admin_add_owner') {
        await setAdminState(from, ADMIN_STATE.ADD_OWNER);
        await sendTextMessage(
            from,
            `👤 *Add Store Owner*\n\nSend:\n+27XXXXXXXXX, Store Name\n\n_Example:_\n+27712345678, Mzansi Market`
        );
        return;
    }

    if (input === 'admin_list_owners') {
        await clearAdminState(from);
        await showOwnerInvites(from);
        return;
    }

    if (input === 'admin_revoke_owner') {
        await setAdminState(from, ADMIN_STATE.REVOKE_OWNER);
        await showRevokableInvites(from);
        return;
    }

    if (input.startsWith('admin_revoke_')) {
        const inviteId = input.replace('admin_revoke_', '');
        await db.merchantInvite.update({
            where: { id: inviteId },
            data: { status: InviteStatus.REVOKED }
        });
        await clearAdminState(from);
        await sendTextMessage(from, '✅ Invite revoked.');
        await showAdminMenu(from);
        return;
    }

    if (session.state === ADMIN_STATE.ADD_OWNER) {
        await handleAddOwnerInput(from, input);
        return;
    }
};

export const isAdminNumber = (from: string): boolean =>
    PLATFORM_ADMIN_NUMBERS.some(adminNumber => isSameWaId(adminNumber, from));

const showAdminMenu = async (to: string): Promise<void> => {
    await sendButtons(
        to,
        `🧰 *${PLATFORM_NAME} Admin*\n\nManage store owners.`,
        [
            { id: 'admin_add_owner', title: '➕ Add Owner' },
            { id: 'admin_list_owners', title: '📋 View Owners' },
            { id: 'admin_revoke_owner', title: '🗑️ Revoke' }
        ]
    );
};

const handleAddOwnerInput = async (from: string, input: string): Promise<void> => {
    const [rawPhone, ...labelParts] = input.split(',');
    const normalizedPhone = normalizeWaId(rawPhone || '');
    const label = labelParts.join(',').trim() || null;

    if (normalizedPhone.length < 9) {
        await sendTextMessage(from, '⚠️ Please provide a valid phone number.');
        return;
    }

    const invite = await db.merchantInvite.upsert({
        where: { wa_id: normalizedPhone },
        update: { status: InviteStatus.PENDING, label },
        create: { wa_id: normalizedPhone, status: InviteStatus.PENDING, label, added_by: normalizeWaId(from) }
    });

    await clearAdminState(from);
    await sendTextMessage(
        from,
        `✅ Invite saved for ${normalizedPhone}${label ? ` (${label})` : ''}.`
    );

    await sendTextMessage(
        normalizedPhone,
        `👋 Welcome to *${PLATFORM_NAME}*!\n\nYou've been added as a store owner. Reply *sell* to start setting up your store.`
    );

    await showAdminMenu(from);
};

const showOwnerInvites = async (to: string): Promise<void> => {
    const invites = await db.merchantInvite.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
    });

    if (invites.length === 0) {
        await sendTextMessage(to, '📭 No owner invites yet.');
        return;
    }

    await sendListMessage(
        to,
        `📋 *Latest Owner Invites* (${invites.length})`,
        'View',
        [
            {
                title: 'Owners',
                rows: invites.map(invite => ({
                    id: `admin_owner_${invite.id}`,
                    title: invite.label ? invite.label.substring(0, 24) : invite.wa_id,
                    description: `${invite.wa_id} • ${invite.status}`
                }))
            }
        ]
    );
};

const showRevokableInvites = async (to: string): Promise<void> => {
    const invites = await db.merchantInvite.findMany({
        where: { status: InviteStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        take: 10
    });

    if (invites.length === 0) {
        await sendTextMessage(to, '📭 No pending invites to revoke.');
        await clearAdminState(to);
        return;
    }

    await sendListMessage(
        to,
        `🗑️ *Revoke Owner Invite*`,
        'Select',
        [
            {
                title: 'Pending Invites',
                rows: invites.map(invite => ({
                    id: `admin_revoke_${invite.id}`,
                    title: invite.label ? invite.label.substring(0, 24) : invite.wa_id,
                    description: invite.wa_id
                }))
            }
        ]
    );
};

const setAdminState = async (from: string, state: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { state } });
};

const clearAdminState = async (from: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { state: null } });
};
