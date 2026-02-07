import { PrismaClient, Merchant, UserSession } from '@prisma/client';
import { sendButtons, sendTextMessage } from './sender';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

const STATE = {
    MESSAGE: 'BROADCAST_MESSAGE'
};

export const handleBroadcastActions = async (
    from: string,
    input: string,
    session: UserSession,
    merchant: Merchant
): Promise<void> => {
    const state = session.active_prod_id || '';

    if (input === 'm_broadcast') {
        await setState(from, STATE.MESSAGE);
        await sendButtons(from, '📣 *Broadcast*\n\nSend a message to opted-in customers.\nType your message below (or cancel).', [
            { id: 'b_cancel', title: '❌ Cancel' }
        ]);
        return;
    }

    if (input === 'b_cancel') {
        await clearState(from);
        await sendTextMessage(from, '❌ Broadcast cancelled.');
        return;
    }

    if (state === STATE.MESSAGE) {
        const messageText = input.trim();
        if (!messageText) {
            await sendTextMessage(from, '⚠️ Message cannot be empty. Try again or cancel.');
            return;
        }

        await clearState(from);

        const recipients = await db.merchantCustomer.findMany({
            where: { merchant_id: merchant.id, marketing_opt_in: true }
        });

        if (recipients.length === 0) {
            await sendTextMessage(from, '📭 No opted-in customers to broadcast to yet.');
            return;
        }

        await sendTextMessage(from, `📣 Sending to ${recipients.length} customer${recipients.length === 1 ? '' : 's'}...`);

        for (const recipient of recipients) {
            await sendTextMessage(recipient.wa_id, `📣 *${merchant.trading_name}*\n\n${messageText}`);
        }

        await sendTextMessage(from, '✅ Broadcast sent.');
        return;
    }
};

const setState = async (from: string, state: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: state } });
};

const clearState = async (from: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
};
