import { db } from '../../lib/db';
import { Prisma } from '@prisma/client';

/**
 * Audit log action categories — use these constants for consistent filtering.
 *
 * Merchant lifecycle
 *   INVITE_SENT | INVITE_ACCEPTED | INVITE_DECLINED
 *   TERMS_ACCEPTED | STORE_WENT_LIVE
 *   ADMIN_STORE_ACTIVATED | ADMIN_STORE_SUSPENDED | ADMIN_STORE_UNSUSPENDED | ADMIN_STATUS_OVERRIDE
 *   ADMIN_ACCESS_REVOKED
 *
 * Orders
 *   ORDER_PLACED | ORDER_PAID | ORDER_MARKED_READY | ORDER_COMPLETED
 *   ORDER_CANCELLED_CUSTOMER | ORDER_CANCELLED_MERCHANT
 *
 * Engagement
 *   BROADCAST_SENT | CUSTOMER_OPT_OUT
 *
 * Feedback (existing)
 *   CUSTOMER_FEEDBACK | MERCHANT_FEEDBACK
 */
export const AuditAction = {
    // Merchant lifecycle
    INVITE_SENT:              'INVITE_SENT',
    INVITE_ACCEPTED:          'INVITE_ACCEPTED',
    INVITE_DECLINED:          'INVITE_DECLINED',
    TERMS_ACCEPTED:           'TERMS_ACCEPTED',
    KYC_SUBMITTED:            'KYC_SUBMITTED',
    STORE_WENT_LIVE:          'STORE_WENT_LIVE',
    ADMIN_STORE_ACTIVATED:    'ADMIN_STORE_ACTIVATED',
    ADMIN_STORE_SUSPENDED:    'ADMIN_STORE_SUSPENDED',
    ADMIN_STORE_UNSUSPENDED:  'ADMIN_STORE_UNSUSPENDED',
    ADMIN_STATUS_OVERRIDE:    'ADMIN_STATUS_OVERRIDE',
    ADMIN_ACCESS_REVOKED:     'ADMIN_ACCESS_REVOKED',
    // Orders
    ORDER_PLACED:             'ORDER_PLACED',
    ORDER_PAID:               'ORDER_PAID',
    ORDER_MARKED_READY:       'ORDER_MARKED_READY',
    ORDER_COMPLETED:          'ORDER_COMPLETED',
    ORDER_CANCELLED_CUSTOMER: 'ORDER_CANCELLED_CUSTOMER',
    ORDER_CANCELLED_MERCHANT: 'ORDER_CANCELLED_MERCHANT',
    // Engagement
    BROADCAST_SENT:           'BROADCAST_SENT',
    CUSTOMER_OPT_OUT:         'CUSTOMER_OPT_OUT',
    // Feedback (kept here for reference — logged separately in their own flows)
    CUSTOMER_FEEDBACK:        'CUSTOMER_FEEDBACK',
    MERCHANT_FEEDBACK:        'MERCHANT_FEEDBACK',
} as const;

export type AuditActionType = typeof AuditAction[keyof typeof AuditAction];

/**
 * Write a record to AuditLog. Never throws — logging failures are swallowed
 * so they can't break the main request flow.
 */
export const log = async (
    action: AuditActionType,
    actorWaId: string,
    entityType: string,
    entityId: string,
    metadata?: Record<string, any>
): Promise<void> => {
    try {
        await db.auditLog.create({
            data: {
                actor_wa_id:   actorWaId,
                action,
                entity_type:   entityType,
                entity_id:     entityId,
                metadata_json: (metadata ?? {}) as Prisma.InputJsonValue
            }
        });
    } catch (e) {
        console.error(`[AuditLog] Failed to write ${action}:`, e);
    }
};
