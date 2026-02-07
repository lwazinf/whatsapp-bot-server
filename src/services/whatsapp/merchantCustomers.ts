import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export const upsertMerchantCustomer = async (
    merchantId: string,
    waId: string,
    displayName?: string | null
): Promise<void> => {
    await db.merchantCustomer.upsert({
        where: { merchant_id_wa_id: { merchant_id: merchantId, wa_id: waId } },
        update: {
            display_name: displayName ?? undefined,
            last_interaction_at: new Date()
        },
        create: {
            merchant_id: merchantId,
            wa_id: waId,
            display_name: displayName ?? null,
            last_interaction_at: new Date()
        }
    });
};

export const setCustomerLastMerchant = async (waId: string, merchantId: string): Promise<void> => {
    await db.userSession.update({
        where: { wa_id: waId },
        data: { last_merchant_id: merchantId }
    });
};
