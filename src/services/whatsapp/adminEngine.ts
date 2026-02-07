import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

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
    metadata?: Record<string, unknown> | null;
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

export const logInviteAdded = async (
    actorWaId: string,
    inviteeWaId: string,
    metadata?: Record<string, unknown>
): Promise<void> => {
    await logAudit({
        actorWaId,
        action: 'INVITE_ADDED',
        entityType: 'INVITE',
        entityId: inviteeWaId,
        metadata: { invitee_wa_id: inviteeWaId, ...metadata }
    });
};

export const logInviteRevoked = async (
    actorWaId: string,
    inviteeWaId: string,
    metadata?: Record<string, unknown>
): Promise<void> => {
    await logAudit({
        actorWaId,
        action: 'INVITE_REVOKED',
        entityType: 'INVITE',
        entityId: inviteeWaId,
        metadata: { invitee_wa_id: inviteeWaId, ...metadata }
    });
};
