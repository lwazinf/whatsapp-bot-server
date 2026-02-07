import { Merchant } from '@prisma/client';

export type BrandingSettings = Pick<Merchant, 'locale' | 'currency_code' | 'currency_symbol'>;

type LocaleTemplates = {
    itemsLabel: string;
    totalLabel: string;
    orderLabel: string;
    statusLabels: Record<string, string>;
    orderReadyTitle: string;
    orderReadyBody: (merchantName: string) => string;
    orderCompleteTitle: string;
    orderCompleteThanks: (merchantName: string) => string;
    feeLabel: string;
    earningsLabel: string;
};

const DEFAULT_LOCALE = 'en-US';
const DEFAULT_CURRENCY_CODE = 'ZAR';
const DEFAULT_CURRENCY_SYMBOL = 'R';

const EN_TEMPLATES: LocaleTemplates = {
    itemsLabel: 'Items',
    totalLabel: 'Total',
    orderLabel: 'Order',
    statusLabels: {
        PENDING: 'Pending',
        PAID: 'Paid',
        READY_FOR_PICKUP: 'Ready for Pickup',
        COMPLETED: 'Completed',
        CANCELLED: 'Cancelled'
    },
    orderReadyTitle: 'Order Ready!',
    orderReadyBody: (merchantName: string) => `Your order from *${merchantName}* is ready!`,
    orderCompleteTitle: 'Order Complete!',
    orderCompleteThanks: (merchantName: string) => `Thank you for ordering from *${merchantName}*!`,
    feeLabel: 'Fee',
    earningsLabel: 'Earnings'
};

const PT_TEMPLATES: LocaleTemplates = {
    itemsLabel: 'Itens',
    totalLabel: 'Total',
    orderLabel: 'Pedido',
    statusLabels: {
        PENDING: 'Pendente',
        PAID: 'Pago',
        READY_FOR_PICKUP: 'Pronto para retirada',
        COMPLETED: 'Concluído',
        CANCELLED: 'Cancelado'
    },
    orderReadyTitle: 'Pedido pronto!',
    orderReadyBody: (merchantName: string) => `Seu pedido da *${merchantName}* está pronto!`,
    orderCompleteTitle: 'Pedido concluído!',
    orderCompleteThanks: (merchantName: string) => `Obrigado por comprar na *${merchantName}*!`,
    feeLabel: 'Taxa',
    earningsLabel: 'Ganhos'
};

export const getLocaleTemplates = (locale?: string | null): LocaleTemplates => {
    const normalized = locale?.toLowerCase() ?? '';
    if (normalized.startsWith('pt')) {
        return PT_TEMPLATES;
    }
    return EN_TEMPLATES;
};

export const formatOrderStatus = (status: string, locale?: string | null): string => {
    const templates = getLocaleTemplates(locale);
    return templates.statusLabels[status] || status;
};

export const formatCurrency = (amount: number, branding?: BrandingSettings | null): string => {
    const locale = branding?.locale || DEFAULT_LOCALE;
    const currencyCode = branding?.currency_code || DEFAULT_CURRENCY_CODE;
    const currencySymbol = branding?.currency_symbol;

    try {
        const formatter = new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currencyCode,
            currencyDisplay: 'symbol',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        const parts = formatter.formatToParts(amount);
        const hasCurrency = parts.some(part => part.type === 'currency');
        const formatted = parts
            .map(part => (part.type === 'currency' ? (currencySymbol || part.value) : part.value))
            .join('');

        if (hasCurrency) {
            return formatted;
        }
    } catch {
        // fallback below
    }

    const numberFormatter = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    const formattedNumber = numberFormatter.format(amount);
    return `${currencySymbol || DEFAULT_CURRENCY_SYMBOL}${formattedNumber}`;
};
