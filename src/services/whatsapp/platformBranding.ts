import { PrismaClient, PlatformBranding } from '@prisma/client';

const DEFAULT_PLATFORM_NAME = 'Omeru';
const DEFAULT_SWITCH_CODE = 'SwitchOmeru';
const DEFAULT_PLATFORM_FEE = 0.07;
const DEFAULT_PAYOUT_DAY = 'Friday';

export const getPlatformBranding = async (db: PrismaClient): Promise<PlatformBranding | null> => {
    try {
        return await db.platformBranding.findFirst();
    } catch (error) {
        console.error('❌ Failed to load platform branding:', (error as Error).message);
        return null;
    }
};

export const getPlatformSettings = async (
    db: PrismaClient
): Promise<{
    name: string;
    switchCode: string;
    platformFee: number;
    payoutDay: string;
}> => {
    const branding = await getPlatformBranding(db);
    return {
        name: branding?.name || DEFAULT_PLATFORM_NAME,
        switchCode: branding?.switch_code || DEFAULT_SWITCH_CODE,
        platformFee: branding?.platform_fee ?? DEFAULT_PLATFORM_FEE,
        payoutDay: branding?.payout_day || DEFAULT_PAYOUT_DAY
    };
};
