export type Branding = {
    appName: string;
    currencySymbol: string;
};

export type BrandingInput = Partial<Branding>;

const DEFAULT_BRANDING: Branding = {
    appName: 'Omeru',
    currencySymbol: 'R'
};

const safeText = (value: string): string => value.replace(/\r/g, '').trim();

const resolveBranding = (input: BrandingInput = {}): Branding => ({
    appName: input.appName ?? process.env.WHATSAPP_BRAND_NAME ?? DEFAULT_BRANDING.appName,
    currencySymbol: input.currencySymbol ?? process.env.WHATSAPP_CURRENCY_SYMBOL ?? DEFAULT_BRANDING.currencySymbol
});

export const welcomeMessage = (branding?: BrandingInput): string => {
    const { appName } = resolveBranding(branding);
    return safeText(`👋 Welcome to *${appName}*!\n\nWhat would you like to do?`);
};

export const inviteMessage = (branding?: BrandingInput): string => {
    const { appName } = resolveBranding(branding);
    return safeText(`🤝 Invite friends to *${appName}* and earn rewards together!`);
};

export const termsMessage = (branding?: BrandingInput): string => {
    const { appName } = resolveBranding(branding);
    return safeText(
        `📜 *Step 6/6: Terms*\n\n` +
            `• Platform Fee: 7%\n` +
            `• Payouts: Every Friday\n` +
            `• Keep ${appName} store open during hours\n\n` +
            'Accept terms?'
    );
};

export const switchModeMessage = (mode: string, branding?: BrandingInput): string => {
    const { appName } = resolveBranding(branding);
    return safeText(`🔄 Switched to *${mode}* mode on ${appName}.`);
};

export const merchantNotFoundMessage = (branding?: BrandingInput): string => {
    const { appName } = resolveBranding(branding);
    return safeText(`⚠️ Merchant profile not found. Switched to ${appName} Customer mode.`);
};

export const startSellingMessage = (branding?: BrandingInput): string => {
    const { appName } = resolveBranding(branding);
    return safeText(
        `🏪 *Start Selling on ${appName}!*\n\n` +
            "Let's set up your shop.\n\n" +
            '📝 *Step 1 of 6: Shop Name*\n' +
            'What is your trading/shop name?'
    );
};

export const genericErrorMessage = (): string => safeText('⚠️ Something went wrong. Please try again.');

export const registrationPausedMessage = (): string =>
    safeText('📋 Registration paused. Type *sell* to continue later.');

export const alreadyRegisteredMessage = (): string => safeText('✅ Already registered!');

export const onboardingErrorMessage = (): string => safeText('❌ Error. Try again or type *cancel*.');

export const tradingNamePromptMessage = (branding?: BrandingInput): string => {
    const { appName } = resolveBranding(branding);
    return safeText(
        `🏪 *Welcome to ${appName}!*\n\n` +
            "Let's set up your shop.\n\n" +
            '📝 *Step 1/6: Shop Name*\n' +
            'What is your trading name?'
    );
};

export const tradingNameInvalidMessage = (): string => safeText('⚠️ Name must be 3-50 characters.');

export const tradingNameSavedMessage = (name: string, handle: string): string =>
    safeText(`✅ *${name}* (@${handle})\n\n📝 *Step 2/6: Owner Details*\nFull legal name of owner/company?`);

export const legalNameInvalidMessage = (): string => safeText('⚠️ Please enter a valid name.');

export const legalNameSavedMessage = (name: string): string =>
    safeText(`✅ ${name}\n\n📝 *Step 3/6: ID*\nSA ID (13 digits) or CIPC number?`);

export const idInvalidMessage = (): string =>
    safeText('⚠️ Invalid ID. Enter 13-digit SA ID or CIPC number.');

export const idSavedMessage = (): string =>
    safeText(
        '✅ ID saved.\n\n' +
            '📝 *Step 4/6: Bank Details*\n\n' +
            'Format: *Bank, Account Number, Type*\n\n' +
            '_Example: FNB, 62845678901, Cheque_'
    );

export const bankFormatWarningMessage = (): string => safeText('⚠️ Use format: Bank, Account Number, Type');

export const bankInvalidAccountMessage = (): string => safeText('⚠️ Invalid account number.');

export const bankSavedMessage = (bank: string, accountLast4: string): string =>
    safeText(
        `✅ ${bank} ****${accountLast4}\n\n` +
            '📝 *Step 5/6: Hours*\n\n' +
            'When are you open?'
    );

export const hoursStandardLabel = (): string => safeText('✅ Standard Hours');

export const hoursCustomLabel = (): string => safeText('✏️ Custom Hours');

export const hoursPromptMessage = (): string =>
    safeText('⏰ Mon-Fri hours?\n\n*HH:MM - HH:MM*\n\nExample: 08:00 - 18:00\nOr "closed"');

export const hoursFormatWarningMessage = (): string => safeText('⚠️ Use: HH:MM - HH:MM');

export const weekdayHoursSavedMessage = (): string => safeText('✅ Weekdays set.\n\nNow Saturday?\n\nOr "closed"');

export const hoursStepMessage = (): string => safeText('📝 *Step 5/6: Hours*');

export const termsAcceptLabel = (): string => safeText('✅ I Accept');

export const termsCancelLabel = (): string => safeText('❌ Cancel');

export const termsAcceptedMessage = (tradingName: string, handle: string): string =>
    safeText(
        `🎉 *Congratulations!*\n\n*${tradingName}* is LIVE!\n📱 @${handle}\n\nAdd your first product!`
    );

export const addProductLabel = (): string => safeText('➕ Add Product');

export const dashboardLabel = (): string => safeText('🏪 Dashboard');

export const browseShopsLabel = (): string => safeText('🪪 Browse Shops');

export const myOrdersLabel = (): string => safeText('📦 My Orders');

export const inventoryMenuMessage = (count: number): string =>
    safeText(`📦 *Menu Manager*\n\n${count} active items`);

export const addItemLabel = (): string => safeText('➕ Add Item');

export const viewMenuLabel = (): string => safeText('👀 View Menu');

export const dashboardHomeLabel = (): string => safeText('🏠 Dashboard');

export const menuEmptyMessage = (): string => safeText('📭 Your menu is empty. Add your first item!');

export const menuListTitle = (count: number): string => safeText(`📦 *Your Menu* (${count} items)`);

export const viewItemsLabel = (): string => safeText('📋 View Items');

export const productsSectionTitle = (): string => safeText('Products');

export const actionsLabel = (): string => safeText('Actions:');

export const backLabel = (): string => safeText('⬅️ Back');

export const navLabel = (): string => safeText('Nav:');

export const productNotFoundMessage = (): string => safeText('❌ Product not found.');

export const productStatusMessage = (name: string, isInStock: boolean): string =>
    safeText(`✅ *${name}* is now ${isInStock ? '🟢 In Stock' : '🔴 Out of Stock'}`);

export const deleteConfirmMessage = (name: string): string => safeText(`⚠️ Delete *${name}*?`);

export const confirmDeleteLabel = (): string => safeText('🗑️ Yes, Delete');

export const cancelDeleteLabel = (): string => safeText('❌ Cancel');

export const productDeletedMessage = (name: string): string => safeText(`🗑️ *${name}* deleted.`);

export const addItemStartMessage = (): string =>
    safeText('🛒 *Add New Item*\n\n*Step 1/3:* What is the product name?\n\n_Type "cancel" to exit_');

export const addItemCancelledMessage = (): string => safeText('❌ Cancelled.');

export const productNameInvalidMessage = (): string => safeText('⚠️ Name must be 2-50 characters.');

export const productNameSavedMessage = (name: string): string =>
    safeText(`✅ *${name}*\n\n*Step 2/3:* What is the price?\n\n_Example: 45.50_`);

export const priceInvalidMessage = (): string => safeText('⚠️ Enter a valid price (e.g., 45.50)');

export const priceSavedMessage = (price: number, branding?: BrandingInput): string => {
    const { currencySymbol } = resolveBranding(branding);
    return safeText(`💰 ${currencySymbol}${price.toFixed(2)}\n\n*Step 3/3:* Send a photo of the item.`);
};

export const skipImageLabel = (): string => safeText('⏭️ Skip');

export const imagePromptMessage = (): string => safeText('⚠️ Send an image or skip.');

export const reviewMessage = (
    name: string,
    price: number,
    hasImage: boolean,
    branding?: BrandingInput
): string => {
    const { currencySymbol } = resolveBranding(branding);
    return safeText(
        `🔍 *Review*\n\n📦 ${name}\n💰 ${currencySymbol}${price.toFixed(2)}\n${
            hasImage ? '📸 Image added' : '📷 No image'
        }\n\nPublish?`
    );
};

export const publishLabel = (): string => safeText('🚀 Make Live');

export const cancelProductLabel = (): string => safeText('❌ Cancel');

export const productLiveMessage = (): string => safeText('🎉 Product is now live!');

export const followPromptsMessage = (): string =>
    safeText('⚠️ Please follow the prompts or type *cancel*.');

export const inventoryErrorMessage = (): string => safeText('❌ Error occurred.');

export const menuItemRowDescription = (
    price: number,
    isInStock: boolean,
    branding?: BrandingInput
): string => {
    const { currencySymbol } = resolveBranding(branding);
    return safeText(`${currencySymbol}${price.toFixed(2)} • ${isInStock ? '🟢' : '🔴'}`);
};

export const productDetailsMessage = (
    name: string,
    price: number,
    isInStock: boolean,
    branding?: BrandingInput
): string => {
    const { currencySymbol } = resolveBranding(branding);
    return safeText(
        `📦 *${name}*\n\n${currencySymbol}${price.toFixed(2)}\n${
            isInStock ? '🟢 In Stock' : '🔴 Out of Stock'
        }`
    );
};

export const inStockLabel = (): string => safeText('🟢 In Stock');

export const outOfStockLabel = (): string => safeText('🔴 Out of Stock');

export const deleteLabel = (): string => safeText('🗑️ Delete');

export const confirmLiveFallbackMessage = (): string => safeText('❌ Not found.');
