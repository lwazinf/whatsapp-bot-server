import { Merchant, UserSession } from '@prisma/client';
import { sendButtons, sendTextMessage } from './sender';
import { buildOptOutFooter } from './messageTemplates';
import { db } from '../../lib/db';

const STATE = {
    MESSAGE: 'BROADCAST_MESSAGE'
};

const BROADCAST_DELAY_MS = 250;

export const handleBroadcastActions = async (
    from: string,
    input: string,
    session: UserSession,
    merchant: Merchant
): Promise<void> => {
    const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: merchant.id } });
    const state = session.active_prod_id || '';

    if (input === 'm_broadcast') {
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: STATE.MESSAGE } });
        await sendButtons(
            from,
            '📣 *Broadcast*\n\nSend an update to your customers. Type your message below.',
            [
                { id: 'b_cancel', title: '❌ Cancel' }
            ]
        );
        return;
    }

    if (input === 'b_cancel') {
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        await sendTextMessage(from, '❌ Broadcast cancelled.');
        return;
    }

    if (state === STATE.MESSAGE) {
        const text = input.trim();
        if (!text) {
            await sendTextMessage(from, '⚠️ Please enter a message.');
            return;
        }

        const customers = await db.merchantCustomer.findMany({
            where: { merchant_id: merchant.id, opt_out: false },
            select: { wa_id: true },
            orderBy: { last_interaction_at: 'desc' },
            take: 500
        });

        if (customers.length === 0) {
            await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
            await sendTextMessage(from, '📭 No opted-in customers yet.');
            return;
        }

        const payload = `${text}${buildOptOutFooter(merchant, merchantBranding)}`;
        let sent = 0;
        for (const customer of customers) {
            // eslint-disable-next-line no-await-in-loop
            const ok = await sendTextMessage(customer.wa_id, payload);
            if (ok) sent += 1;
            // eslint-disable-next-line no-await-in-loop
            await sleep(BROADCAST_DELAY_MS);
        }

        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        await sendTextMessage(from, `✅ Broadcast sent to ${sent} customers.`);
        return;
    }
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
