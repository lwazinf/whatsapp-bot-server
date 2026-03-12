import { Prisma } from '@prisma/client';
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

export const logInviteAdded = async (
    actorWaId: string,
    inviteeWaId: string,
    metadata?: Prisma.InputJsonValue
): Promise<void> => {
    const extraMetadata =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
    await logAudit({
        actorWaId,
        action: 'INVITE_ADDED',
        entityType: 'INVITE',
        entityId: inviteeWaId,
        metadata: { invitee_wa_id: inviteeWaId, ...extraMetadata }
    });
};

export const logInviteRevoked = async (
    actorWaId: string,
    inviteeWaId: string,
    metadata?: Prisma.InputJsonValue
): Promise<void> => {
    const extraMetadata =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
    await logAudit({
        actorWaId,
        action: 'INVITE_REVOKED',
        entityType: 'INVITE',
        entityId: inviteeWaId,
        metadata: { invitee_wa_id: inviteeWaId, ...extraMetadata }
    });
};
