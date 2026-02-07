export const PLATFORM_NAME = process.env.PLATFORM_NAME || 'Omeru';
export const PLATFORM_SWITCH_CODE =
    process.env.PLATFORM_SWITCH_CODE || `Switch${PLATFORM_NAME.replace(/\s+/g, '')}`;
export const PLATFORM_ADMIN_NUMBERS = (process.env.PLATFORM_ADMIN_NUMBERS || '27746854339')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
export const PLATFORM_FEE_PERCENTAGE = Number(process.env.PLATFORM_FEE_PERCENTAGE || 5);
export const PLATFORM_PAYOUT_DAY = process.env.PLATFORM_PAYOUT_DAY || 'Friday';
export const OWNER_INVITES_REQUIRED = (process.env.OWNER_INVITES_REQUIRED || 'true').toLowerCase() !== 'false';
