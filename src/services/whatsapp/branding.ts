import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export type BrandingSettings = {
    brandName: string;
    welcomeMessage: string;
    switchCode: string;
    currencySymbol: string;
    timezone: string;
    supportNumber: string;
    themeVariant: string;
};

const DEFAULT_BRANDING: BrandingSettings = {
    brandName: 'Omeru',
    welcomeMessage: '👋 Welcome to *Omeru*!\n\nWhat would you like to do?',
    switchCode: 'SwitchOmeru',
    currencySymbol: 'R',
    timezone: 'Africa/Johannesburg',
    supportNumber: '',
    themeVariant: 'default'
};

export const getBrandingForMerchant = async (merchantId?: string | null): Promise<BrandingSettings> => {
    const [merchantBranding, globalBranding] = await Promise.all([
        merchantId ? db.merchantBranding.findUnique({ where: { merchant_id: merchantId } }) : null,
        db.merchantBranding.findFirst({ where: { merchant_id: null } })
    ]);

    return {
        brandName: merchantBranding?.brand_name ?? globalBranding?.brand_name ?? DEFAULT_BRANDING.brandName,
        welcomeMessage: merchantBranding?.welcome_message ?? globalBranding?.welcome_message ?? DEFAULT_BRANDING.welcomeMessage,
        switchCode: merchantBranding?.switch_code ?? globalBranding?.switch_code ?? DEFAULT_BRANDING.switchCode,
        currencySymbol: merchantBranding?.currency_symbol ?? globalBranding?.currency_symbol ?? DEFAULT_BRANDING.currencySymbol,
        timezone: merchantBranding?.timezone ?? globalBranding?.timezone ?? DEFAULT_BRANDING.timezone,
        supportNumber: merchantBranding?.support_number ?? globalBranding?.support_number ?? DEFAULT_BRANDING.supportNumber,
        themeVariant: merchantBranding?.theme_variant ?? globalBranding?.theme_variant ?? DEFAULT_BRANDING.themeVariant
    };
};
