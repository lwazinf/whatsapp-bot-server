import { Merchant, MerchantBranding, PlatformBranding } from '@prisma/client';

const DEFAULT_LOCALE = 'en-ZA';
const DEFAULT_CURRENCY = 'ZAR';

type BrandingContext = {
    merchant?: Merchant | null;
    merchantBranding?: MerchantBranding | null;
    platform?: PlatformBranding | null;
};

export const resolveLocale = ({ merchant, merchantBranding, platform }: BrandingContext): string => {
    return merchantBranding?.locale || merchant?.locale || platform?.default_locale || DEFAULT_LOCALE;
};

export const resolveCurrency = ({ merchant, merchantBranding, platform }: BrandingContext): string => {
    return merchantBranding?.currency || merchant?.currency || platform?.default_currency || DEFAULT_CURRENCY;
};

export const formatCurrency = (amount: number, context: BrandingContext): string => {
    const locale = resolveLocale(context);
    const currency = resolveCurrency(context);
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            currencyDisplay: 'narrowSymbol',
            maximumFractionDigits: 2
        }).format(amount);
    } catch {
        const safeAmount = Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
        return `${currency} ${safeAmount}`;
    }
};

export const buildMerchantWelcome = (merchant: Merchant, platform?: PlatformBranding | null): string => {
    const platformName = platform?.name || 'Omeru';
    const intro = merchant.welcome_message || merchant.description || 'Browse our menu below.';
    return `👋 Welcome to *${merchant.trading_name}* on ${platformName}!\n\n${intro}`;
};

export const buildOptOutFooter = (merchant: Merchant, merchantBranding?: MerchantBranding | null): string => {
    const brandName = merchant.brand_name || merchant.trading_name;
    if (merchantBranding?.message_footer) {
        return `\n\n${merchantBranding.message_footer}`;
    }
    return `\n\nReply *STOP* to opt out of ${brandName} updates.`;
};
