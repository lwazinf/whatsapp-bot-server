import { PrismaClient } from '@prisma/client';
import { sendTextMessage } from './sender';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

const BROADCAST_MESSAGE_DELAY_MS = Number(process.env.BROADCAST_MESSAGE_DELAY_MS ?? 300);
const BROADCAST_BATCH_SIZE = Number(process.env.BROADCAST_BATCH_SIZE ?? 25);
const BROADCAST_BATCH_DELAY_MS = Number(process.env.BROADCAST_BATCH_DELAY_MS ?? 5000);

const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

export const sendBroadcastMessage = async (
    merchantId: string,
    message: string
): Promise<{ sent: number; skipped: number; failed: number }> => {
    const customers = await db.merchantCustomer.findMany({
        where: { merchant_id: merchantId, marketing_opt_in: true },
        orderBy: { updatedAt: 'desc' }
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (let index = 0; index < customers.length; index += 1) {
        const customer = customers[index];

        if (!customer) {
            skipped += 1;
            continue;
        }

        const delivered = await sendTextMessage(customer.customer_id, message);

        if (delivered) {
            sent += 1;
            await db.merchantCustomer.update({
                where: { id: customer.id },
                data: { last_broadcast_at: new Date() }
            });
        } else {
            failed += 1;
        }

        if ((index + 1) % BROADCAST_BATCH_SIZE === 0) {
            await sleep(BROADCAST_BATCH_DELAY_MS);
        } else {
            await sleep(BROADCAST_MESSAGE_DELAY_MS);
        }
    }

    return { sent, skipped, failed };
};
