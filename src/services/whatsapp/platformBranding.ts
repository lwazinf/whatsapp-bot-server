import { PrismaClient, PlatformBranding } from '@prisma/client';

const DEFAULT_PLATFORM_NAME = 'Omeru';
const DEFAULT_SWITCH_CODE = 'SwitchOmeru';
const DEFAULT_PLATFORM_FEE = process.env.PLATFORM_FEE_PERCENTAGE
    ? parseFloat(process.env.PLATFORM_FEE_PERCENTAGE) / 100
    : 0.05;
const DEFAULT_PAYOUT_DAY = 'Friday';

// In-memory cache — avoids a DB round-trip on every message
const BRANDING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let brandingCache: { value: PlatformBranding | null; expiresAt: number } | null = null;

export const getPlatformBranding = async (db: PrismaClient): Promise<PlatformBranding | null> => {
    try {
        if (brandingCache && Date.now() < brandingCache.expiresAt) {
            return brandingCache.value;
        }
        const value = await db.platformBranding.findFirst();
        brandingCache = { value, expiresAt: Date.now() + BRANDING_CACHE_TTL_MS };
        return value;
    } catch (error) {
        console.error('❌ Failed to load platform branding:', (error as Error).message);
        return brandingCache?.value ?? null; // return stale cache on DB error
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
