import { MerchantOwnerRole, Merchant, UserSession } from '@prisma/client';
import { sendTextMessage, sendButtons, sendListMessage } from './sender';
import { getPlatformSettings } from './platformBranding';
import { db } from '../../lib/db';
import { log, AuditAction } from './auditLog';

// ─── Step ordering ───────────────────────────────────────────────────────────

const NEXT_STEP: Record<string, string> = {
    ob_welcome:          'ob_name',
    ob_name:             'ob_image',
    ob_image:            'ob_description',
    ob_description:      'ob_category',
    ob_category:         'ob_location',
    ob_location:         'ob_location_visible',
    ob_location_visible: 'ob_hours',
    ob_hours:            'ob_kyc_intro',
    ob_hours_mf:         'ob_hours_sat',
    ob_hours_sat:        'ob_kyc_intro',
    ob_kyc_intro:        'ob_kyc_id_num',
    ob_kyc_id_num:       'ob_kyc_id_doc',
    ob_kyc_id_doc:       'ob_kyc_bank_proof',
    ob_kyc_bank_proof:   'ob_bank_name',
    ob_bank_name:        'ob_bank_acc',
    ob_bank_acc:         'ob_bank_type',
    ob_bank_type:        'ob_prod_intro',
    ob_prod_intro:       'ob_prod_in_progress',
    ob_prod_done:        'ob_tour_1',
    ob_tour_1:           'ob_tour_2',
    ob_tour_2:           'ob_tour_3',
    ob_tour_3:           'ob_tour_4',
    ob_tour_4:           'ob_tour_5',
    ob_tour_5:           'ob_terms',
    ob_terms:            'ob_golive',
};

// When resuming after product/variant creation — map in-progress steps to a safe display step
const SAFE_RESUME: Record<string, string> = {
    ob_prod_in_progress:    'ob_prod_intro',
    ob_variant_in_progress: 'ob_tour_1',
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Entry point after invite acceptance. Also called from merchantEngine "Resume Setup".
 * For ACTIVE stores (staff joining), starts the tour only.
 */
export const startOnboarding = async (
    waId: string,
    merchant: Merchant,
    _role: MerchantOwnerRole | string
): Promise<void> => {
    let step: string;

    if (merchant.status === 'ACTIVE') {
        // Staff joining an already-live store → orientation tour only
        step = 'ob_tour_1';
    } else {
        // New merchant or resume
        const saved = merchant.onboarding_step ?? null;
        step = saved ? (SAFE_RESUME[saved] ?? saved) : 'ob_welcome';
    }

    await db.userSession.upsert({
        where: { wa_id: waId },
        update: { mode: 'MERCHANT', active_merchant_id: merchant.id, active_prod_id: step },
        create: { wa_id: waId, mode: 'MERCHANT', active_merchant_id: merchant.id, active_prod_id: step }
    });

    await sendStepMessage(waId, merchant, step);
};

/**
 * Called by merchantInventory.ts after a product is published during onboarding.
 */
export const resumeOnboardingAfterProduct = async (
    waId: string,
    merchantId: string
): Promise<void> => {
    const merchant = await db.merchant.update({
        where: { id: merchantId },
        data: { onboarding_step: 'ob_prod_done' }
    });

    await db.userSession.update({
        where: { wa_id: waId },
        data: { active_prod_id: 'ob_prod_done' }
    });

    await sendStepMessage(waId, merchant, 'ob_prod_done');
};

/**
 * Main handler — routes all messages while active_prod_id starts with 'ob'.
 */
export const handleOnboardingAction = async (
    from: string,
    input: string,
    session: UserSession,
    merchant: Merchant,
    message?: any
): Promise<void> => {
    try {
        const step = session.active_prod_id ?? 'ob_welcome';

        switch (step) {
            case 'ob_welcome':    return handleWelcome(from, input, merchant);
            case 'ob_name':       return handleName(from, input, merchant);
            case 'ob_image':      return handleImage(from, input, merchant, message);
            case 'ob_description': return handleDescription(from, input, merchant);
            case 'ob_category':   return handleCategory(from, input, merchant);
            case 'ob_location':   return handleLocation(from, input, merchant);
            case 'ob_location_visible': return handleLocationVisible(from, input, merchant);
            case 'ob_hours':      return handleHoursMenu(from, input, merchant);
            case 'ob_hours_mf':   return handleHoursMf(from, input, merchant);
            case 'ob_hours_sat':  return handleHoursSat(from, input, merchant);
            case 'ob_kyc_intro':  return handleKycIntro(from, input, merchant);
            case 'ob_kyc_id_num': return handleKycIdNum(from, input, merchant);
            case 'ob_kyc_id_doc': return handleKycIdDoc(from, input, merchant, message);
            case 'ob_kyc_bank_proof': return handleKycBankProof(from, input, merchant, message);
            case 'ob_bank_name':  return handleBankName(from, input, merchant);
            case 'ob_bank_acc':   return handleBankAcc(from, input, merchant);
            case 'ob_bank_type':  return handleBankType(from, input, merchant);
            case 'ob_prod_intro': return handleProdIntro(from, input, session, merchant, message);
            case 'ob_prod_done':  return handleProdDone(from, input, session, merchant, message);
            default:
                if (step.startsWith('ob_tour_')) return handleTour(from, input, merchant, step);
                if (step === 'ob_terms')  return handleTerms(from, input, merchant);
                if (step === 'ob_golive') return handleGolive(from, input, merchant);
                // Unknown step → restart from welcome
                await advanceTo(from, merchant, 'ob_welcome');
        }
    } catch (err: any) {
        console.error('❌ Onboarding error:', err.message);
        await sendTextMessage(from, '❌ Something went wrong. Type *menu* to resume setup.');
    }
};

// ─── Step Handlers ────────────────────────────────────────────────────────────

const handleWelcome = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    if (input === 'ob_next') {
        await advanceTo(from, merchant, 'ob_name');
    } else {
        await sendStepMessage(from, merchant, 'ob_welcome');
    }
};

const handleName = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    const keep = input.toLowerCase() === 'ok' || input.toLowerCase() === 'okay';
    if (keep) {
        await advanceTo(from, merchant, 'ob_image');
        return;
    }
    const name = input.trim();
    if (name.length < 3 || name.length > 50) {
        await sendTextMessage(from, '⚠️ Name must be 3–50 characters. Try again:');
        return;
    }
    const handle = await generateHandle(name, merchant.wa_id);
    await db.merchant.update({ where: { id: merchant.id }, data: { trading_name: name, handle } });
    await advanceTo(from, { ...merchant, trading_name: name, handle }, 'ob_image');
};

const handleImage = async (from: string, input: string, merchant: Merchant, message?: any): Promise<void> => {
    let imageId: string | null = null;
    if (message?.type === 'image' && message?.image?.id) {
        imageId = message.image.id;
    } else if (input === 'ob_skip_image') {
        imageId = null;
    } else {
        await sendButtons(from, '📸 Please send a photo or skip for now.', [
            { id: 'ob_skip_image', title: '⏭️ Skip for now' }
        ]);
        return;
    }
    await db.merchant.update({ where: { id: merchant.id }, data: { image_url: imageId } });
    await advanceTo(from, merchant, 'ob_description');
};

const handleDescription = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    const desc = input.trim();
    if (desc.length < 5) {
        await sendTextMessage(from, '⚠️ Please write at least 5 characters describing your store.');
        return;
    }
    await db.merchant.update({ where: { id: merchant.id }, data: { description: desc } });
    await advanceTo(from, merchant, 'ob_category');
};

const handleCategory = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    const validIds = ['cat_food', 'cat_fashion', 'cat_beauty', 'cat_electronics', 'cat_home', 'cat_other'];
    const catMap: Record<string, string> = {
        cat_food: 'Food & Drink', cat_fashion: 'Fashion', cat_beauty: 'Beauty & Wellness',
        cat_electronics: 'Electronics', cat_home: 'Home & Garden', cat_other: 'Other'
    };
    if (!validIds.includes(input)) {
        await sendStepMessage(from, merchant, 'ob_category');
        return;
    }
    await db.merchant.update({ where: { id: merchant.id }, data: { store_category: catMap[input] } });
    await advanceTo(from, merchant, 'ob_location');
};

const handleLocation = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    const addr = input.trim();
    if (addr.length < 5) {
        await sendTextMessage(from, '⚠️ Please enter a full address (street, suburb, city).');
        return;
    }
    await db.merchant.update({ where: { id: merchant.id }, data: { address: addr } });
    await advanceTo(from, merchant, 'ob_location_visible');
};

const handleLocationVisible = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    if (input === 'ob_loc_yes' || input === 'ob_loc_no') {
        await db.merchant.update({
            where: { id: merchant.id },
            data: { location_visible: input === 'ob_loc_yes' }
        });
        await advanceTo(from, merchant, 'ob_hours');
    } else {
        await sendStepMessage(from, merchant, 'ob_location_visible');
    }
};

const handleHoursMenu = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    if (input === 'ob_hours_def') {
        await db.merchant.update({
            where: { id: merchant.id },
            data: { open_time: '09:00', close_time: '17:00', sat_open_time: '10:00', sat_close_time: '15:00', sun_open: false }
        });
        await advanceTo(from, merchant, 'ob_kyc_intro');
    } else if (input === 'ob_hours_cust') {
        await advanceTo(from, merchant, 'ob_hours_mf');
    } else {
        await sendStepMessage(from, merchant, 'ob_hours');
    }
};

const handleHoursMf = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    if (input.toLowerCase() === 'closed') {
        await db.merchant.update({ where: { id: merchant.id }, data: { open_time: '00:00', close_time: '00:00' } });
    } else if (input.includes('-')) {
        const [o, c] = input.split('-').map(s => s.trim());
        await db.merchant.update({ where: { id: merchant.id }, data: { open_time: o, close_time: c } });
    } else {
        await sendTextMessage(from, '⚠️ Use format *HH:MM - HH:MM* or type *closed*.');
        return;
    }
    await advanceTo(from, merchant, 'ob_hours_sat');
};

const handleHoursSat = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    if (input.toLowerCase() === 'closed') {
        await db.merchant.update({ where: { id: merchant.id }, data: { sat_open_time: '00:00', sat_close_time: '00:00', sun_open: false } });
    } else if (input.includes('-')) {
        const [o, c] = input.split('-').map(s => s.trim());
        await db.merchant.update({ where: { id: merchant.id }, data: { sat_open_time: o, sat_close_time: c, sun_open: false } });
    } else {
        await sendTextMessage(from, '⚠️ Use format *HH:MM - HH:MM* or type *closed*.');
        return;
    }
    await advanceTo(from, merchant, 'ob_kyc_intro');
};

const handleKycIntro = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    if (input === 'ob_kyc_cont') {
        await advanceTo(from, merchant, 'ob_kyc_id_num');
    } else {
        await sendStepMessage(from, merchant, 'ob_kyc_intro');
    }
};

const handleKycIdNum = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    const clean = input.replace(/[\s-]/g, '').toUpperCase();
    if (clean.length < 6) {
        await sendTextMessage(from, '⚠️ Invalid ID. Enter your 13-digit SA ID or CIPC registration number.');
        return;
    }
    await db.merchant.update({ where: { id: merchant.id }, data: { id_number: clean } });
    await advanceTo(from, merchant, 'ob_kyc_id_doc');
};

const handleKycIdDoc = async (from: string, _input: string, merchant: Merchant, message?: any): Promise<void> => {
    if (message?.type === 'image' && message?.image?.id) {
        await db.merchant.update({ where: { id: merchant.id }, data: { kyc_id_doc_url: message.image.id } });
        await advanceTo(from, merchant, 'ob_kyc_bank_proof');
    } else {
        await sendTextMessage(from, '📄 Please send a clear photo of your ID document.');
    }
};

const handleKycBankProof = async (from: string, _input: string, merchant: Merchant, message?: any): Promise<void> => {
    if (message?.type === 'image' && message?.image?.id) {
        await db.merchant.update({
            where: { id: merchant.id },
            data: { kyc_bank_proof_url: message.image.id, kyc_submitted_at: new Date() }
        });
        await log(AuditAction.KYC_SUBMITTED, from, 'Merchant', merchant.id, {
            merchant_name: merchant.trading_name
        });
        await advanceTo(from, merchant, 'ob_bank_name');
    } else {
        await sendTextMessage(from, '🏦 Please send a photo of your bank confirmation letter or proof of address.');
    }
};

const handleBankName = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    const bankMap: Record<string, string> = {
        bank_fnb: 'FNB', bank_std: 'Standard Bank', bank_abs: 'ABSA',
        bank_ned: 'Nedbank', bank_cap: 'Capitec', bank_tym: 'TymeBank', bank_other: 'Other'
    };
    if (!bankMap[input]) {
        await sendStepMessage(from, merchant, 'ob_bank_name');
        return;
    }
    await db.merchant.update({ where: { id: merchant.id }, data: { bank_name: bankMap[input] } });
    await advanceTo(from, merchant, 'ob_bank_acc');
};

const handleBankAcc = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    const clean = input.replace(/\D/g, '');
    if (clean.length < 6) {
        await sendTextMessage(from, '⚠️ Please enter a valid account number.');
        return;
    }
    await db.merchant.update({ where: { id: merchant.id }, data: { bank_acc_no: clean } });
    await advanceTo(from, merchant, 'ob_bank_type');
};

const handleBankType = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    const typeMap: Record<string, string> = {
        btype_cheque: 'Cheque', btype_savings: 'Savings', btype_business: 'Business'
    };
    if (!typeMap[input]) {
        await sendStepMessage(from, merchant, 'ob_bank_type');
        return;
    }
    await db.merchant.update({ where: { id: merchant.id }, data: { bank_type: typeMap[input] } });
    await advanceTo(from, merchant, 'ob_prod_intro');
};

const handleProdIntro = async (
    from: string,
    input: string,
    _session: UserSession,
    merchant: Merchant,
    message?: any
): Promise<void> => {
    if (input === 'm_add_prod') {
        // Hand off to inventory — update DB state and let merchantEngine route the rest
        await db.merchant.update({ where: { id: merchant.id }, data: { onboarding_step: 'ob_prod_in_progress' } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        // Import inline to avoid circular at top level
        const { handleInventoryActions } = await import('./merchantInventory');
        const freshSession = await db.userSession.findUnique({ where: { wa_id: from } });
        await handleInventoryActions(from, 'm_add_prod', freshSession!, merchant, message);
    } else {
        await sendStepMessage(from, merchant, 'ob_prod_intro');
    }
};

const handleProdDone = async (
    from: string,
    input: string,
    _session: UserSession,
    merchant: Merchant,
    message?: any
): Promise<void> => {
    if (input === 'ob_variant_start') {
        // Find last product and trigger variant creation
        const lastProd = await db.product.findFirst({
            where: { merchant_id: merchant.id, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' }
        });
        if (!lastProd) {
            await advanceTo(from, merchant, 'ob_tour_1');
            return;
        }
        await db.merchant.update({ where: { id: merchant.id }, data: { onboarding_step: 'ob_variant_in_progress' } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        const { handleInventoryActions } = await import('./merchantInventory');
        const freshSession = await db.userSession.findUnique({ where: { wa_id: from } });
        await handleInventoryActions(from, `add_variant_${lastProd.id}`, freshSession!, merchant, message);
    } else {
        // Skip or any other input → tour
        await advanceTo(from, merchant, 'ob_tour_1');
    }
};

const handleTour = async (from: string, input: string, merchant: Merchant, step: string): Promise<void> => {
    if (input === 'ob_next') {
        const next = NEXT_STEP[step];
        if (!next) { await sendStepMessage(from, merchant, step); return; }

        // After ob_tour_5 → if store is already ACTIVE (staff), skip terms and go to dashboard
        if (step === 'ob_tour_5' && merchant.status === 'ACTIVE') {
            await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
            await sendButtons(from,
                `✅ *You're all set!*\n\nWelcome to *${merchant.trading_name}*! You now know how everything works.`,
                [{ id: 'm_dashboard', title: '🏪 Open Dashboard' }]
            );
            return;
        }
        await advanceTo(from, merchant, next);
    } else {
        await sendStepMessage(from, merchant, step);
    }
};

const handleTerms = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    if (input === 'ob_terms_agree') {
        await advanceTo(from, merchant, 'ob_golive');
    } else {
        // Read again or any other input
        await sendStepMessage(from, merchant, 'ob_terms');
    }
};

const handleGolive = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    if (input === 'ob_golive_launch') {
        const activated = await db.merchant.update({
            where: { id: merchant.id },
            data: {
                status: 'ACTIVE',
                show_in_browse: true,
                onboarding_step: null,
                accepted_terms: true
            }
        });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        await log(AuditAction.STORE_WENT_LIVE, from, 'Merchant', merchant.id, {
            merchant_name: activated.trading_name, handle: activated.handle
        });
        await sendButtons(from,
            `🚀 *${activated.trading_name} is now LIVE!*\n\n` +
            `Customers can find you at *@${activated.handle}*.\n\n` +
            `Welcome to Omeru! 🎉`,
            [
                { id: 'm_inventory', title: '📦 My Products' },
                { id: 'm_dashboard', title: '🏪 Dashboard' }
            ]
        );
    } else {
        await sendStepMessage(from, merchant, 'ob_golive');
    }
};

// ─── Step Message Sender ──────────────────────────────────────────────────────

const sendStepMessage = async (from: string, merchant: Merchant, step: string): Promise<void> => {
    const name = merchant.trading_name || 'your store';

    switch (step) {
        case 'ob_welcome':
            await sendButtons(from,
                `🎉 *Welcome to Omeru, ${name}!*\n\n` +
                `I'll guide you through setting up your store in a few easy steps.\n\n` +
                `This will take about 5 minutes. At the end, your store goes live and customers can start ordering! 🛍️`,
                [{ id: 'ob_next', title: "Let's go 🚀" }]
            );
            break;

        case 'ob_name':
            await sendTextMessage(from,
                `📝 *Step 1 — Store Name*\n\n` +
                `Your store is currently named *${name}*.\n\n` +
                `Type a new name to change it, or send *ok* to keep it.`
            );
            break;

        case 'ob_image':
            await sendButtons(from,
                `📸 *Step 2 — Store Photo*\n\n` +
                `Upload your store's profile photo.\n\n` +
                `Customers will see this when they visit *@${merchant.handle}*. ` +
                `A clear logo or storefront photo works best.`,
                [{ id: 'ob_skip_image', title: '⏭️ Skip for now' }]
            );
            break;

        case 'ob_description':
            await sendTextMessage(from,
                `✏️ *Step 3 — Store Description*\n\n` +
                `Write a short description of your store.\n\n` +
                `_What do you sell? What makes you special?_\n\n` +
                `Example: "Homemade baked goods delivered fresh daily — pies, cakes & rusks."`
            );
            break;

        case 'ob_category':
            await sendListMessage(from,
                `🏷️ *Step 4 — Store Category*\n\nWhat best describes your store?`,
                '📂 Select Category',
                [{
                    title: 'Categories',
                    rows: [
                        { id: 'cat_food',        title: '🍔 Food & Drink',       description: 'Restaurants, takeaways, baked goods' },
                        { id: 'cat_fashion',     title: '👗 Fashion',            description: 'Clothing, shoes, accessories' },
                        { id: 'cat_beauty',      title: '💄 Beauty & Wellness',  description: 'Cosmetics, hair, health' },
                        { id: 'cat_electronics', title: '📱 Electronics',        description: 'Gadgets, devices, accessories' },
                        { id: 'cat_home',        title: '🏡 Home & Garden',      description: 'Furniture, décor, plants' },
                        { id: 'cat_other',       title: '🛍️ Other',             description: 'Doesn\'t fit the above' },
                    ]
                }]
            );
            break;

        case 'ob_location':
            await sendTextMessage(from,
                `📍 *Step 5 — Store Location*\n\n` +
                `Enter your store's address.\n\n` +
                `_Format: Street number, Street name, Suburb, City_\n` +
                `Example: 12 Long St, Gardens, Cape Town`
            );
            break;

        case 'ob_location_visible':
            await sendButtons(from,
                `🗺️ *Location Visibility*\n\n` +
                `Would you like to show your address to customers?`,
                [
                    { id: 'ob_loc_yes', title: '✅ Yes, show it' },
                    { id: 'ob_loc_no',  title: '🔒 Keep it private' }
                ]
            );
            break;

        case 'ob_hours':
            await sendButtons(from,
                `⏰ *Step 6 — Operating Hours*\n\n` +
                `When are you open for business?`,
                [
                    { id: 'ob_hours_def',  title: '✅ Standard Hours' },
                    { id: 'ob_hours_cust', title: '✏️ Custom Hours' }
                ],
                'Standard: Mon–Fri 9am–5pm, Sat 10am–3pm, Sun closed'
            );
            break;

        case 'ob_hours_mf':
            await sendTextMessage(from,
                `⏰ *Mon–Fri hours*\n\n` +
                `Format: *HH:MM - HH:MM*\n` +
                `Example: *08:00 - 18:00*\n\n` +
                `Or type *closed* if you don't trade on weekdays.`
            );
            break;

        case 'ob_hours_sat':
            await sendTextMessage(from,
                `⏰ *Saturday hours*\n\n` +
                `Format: *HH:MM - HH:MM*\n\n` +
                `Or type *closed* if you're closed on Saturdays.`
            );
            break;

        case 'ob_kyc_intro': {
            await sendButtons(from,
                `🔐 *Identity Verification*\n\n` +
                `Omeru is required by law to verify all merchants for compliance. ` +
                `This keeps the platform safe for everyone.\n\n` +
                `You'll need:\n` +
                `• Your SA ID or CIPC number\n` +
                `• A photo of your ID document\n` +
                `• Bank confirmation letter\n\n` +
                `_Your information is kept strictly confidential._`,
                [{ id: 'ob_kyc_cont', title: '🔒 Continue' }]
            );
            break;
        }

        case 'ob_kyc_id_num':
            await sendTextMessage(from,
                `🪪 *SA ID or CIPC Number*\n\n` +
                `Enter your 13-digit South African ID number or CIPC company registration number.\n\n` +
                `Example: *9001015800087*`
            );
            break;

        case 'ob_kyc_id_doc':
            await sendTextMessage(from,
                `📄 *Upload ID Document*\n\n` +
                `Send a clear photo of your:\n` +
                `• South African ID book/card, OR\n` +
                `• CIPC registration certificate\n\n` +
                `_Make sure all details are clearly visible._`
            );
            break;

        case 'ob_kyc_bank_proof':
            await sendTextMessage(from,
                `🏦 *Upload Bank Proof*\n\n` +
                `Send a photo of your:\n` +
                `• Bank confirmation letter, OR\n` +
                `• Recent bank statement (last 3 months)\n\n` +
                `_This confirms your account details for payouts._`
            );
            break;

        case 'ob_bank_name':
            await sendListMessage(from,
                `🏦 *Bank Details — Step 1 of 3*\n\nWhich bank do you use?`,
                '🏦 Select Bank',
                [{
                    title: 'South African Banks',
                    rows: [
                        { id: 'bank_fnb',   title: 'FNB',           description: 'First National Bank' },
                        { id: 'bank_std',   title: 'Standard Bank', description: 'Standard Bank of SA' },
                        { id: 'bank_abs',   title: 'ABSA',          description: 'Absa Bank' },
                        { id: 'bank_ned',   title: 'Nedbank',       description: 'Nedbank Limited' },
                        { id: 'bank_cap',   title: 'Capitec',       description: 'Capitec Bank' },
                        { id: 'bank_tym',   title: 'TymeBank',      description: 'TymeBank' },
                        { id: 'bank_other', title: 'Other',         description: 'Other bank' },
                    ]
                }]
            );
            break;

        case 'ob_bank_acc':
            await sendTextMessage(from,
                `💳 *Bank Account Number*\n\nEnter your account number.\n\nExample: *62845678901*`
            );
            break;

        case 'ob_bank_type':
            await sendButtons(from,
                `🏦 *Account Type*\n\nWhat type of account is it?`,
                [
                    { id: 'btype_cheque',   title: '💳 Cheque' },
                    { id: 'btype_savings',  title: '💰 Savings' },
                    { id: 'btype_business', title: '🏢 Business' }
                ]
            );
            break;

        case 'ob_prod_intro':
            await sendButtons(from,
                `📦 *Your First Product*\n\n` +
                `Every store needs products! Let me show you how to add one.\n\n` +
                `Customers browse your products, add them to cart, and pay right here on WhatsApp — no app needed.\n\n` +
                `Let's add your first item now. You'll need:\n` +
                `• Product name\n• Price\n• Photo (optional)`,
                [{ id: 'm_add_prod', title: '➕ Add my first product' }]
            );
            break;

        case 'ob_prod_done':
            await sendButtons(from,
                `✅ *Product added!*\n\n` +
                `Now let me show you how *variants* work.\n\n` +
                `Variants let you offer different sizes, colours, or options for a single product — e.g. "Small T-Shirt (Blue)" and "Large T-Shirt (Red)".`,
                [
                    { id: 'ob_variant_start', title: '🎨 Add a variant' },
                    { id: 'ob_next',          title: '⏭️ Skip' }
                ]
            );
            break;

        case 'ob_tour_1':
            await sendButtons(from,
                `🍳 *The Kitchen* (1 of 5)\n\n` +
                `When a customer places an order, it appears in your Kitchen. ` +
                `Mark it *Ready* when the order is prepared, and *Collected* when the customer picks it up.\n\n` +
                `_Access it anytime from your dashboard._`,
                [{ id: 'ob_next', title: 'Next ▶' }]
            );
            break;

        case 'ob_tour_2':
            await sendButtons(from,
                `📦 *Inventory* (2 of 5)\n\n` +
                `Manage all your products here. Add new items, update prices, toggle stock availability, and archive products you no longer sell.\n\n` +
                `_Tip: Keep your stock up to date to avoid disappointing customers._`,
                [{ id: 'ob_next', title: 'Next ▶' }]
            );
            break;

        case 'ob_tour_3':
            await sendButtons(from,
                `⚙️ *Settings* (3 of 5)\n\n` +
                `Control your store hours, upload a welcome image that customers see when they first visit, and toggle whether your store appears in Browse.\n\n` +
                `_You can also manually close your store for the day from the dashboard._`,
                [{ id: 'ob_next', title: 'Next ▶' }]
            );
            break;

        case 'ob_tour_4':
            await sendButtons(from,
                `📊 *Stats* (4 of 5)\n\n` +
                `See your total sales, pending orders, active products, and recent order history at a glance.\n\n` +
                `_Great for keeping track of your business performance._`,
                [{ id: 'ob_next', title: 'Next ▶' }]
            );
            break;

        case 'ob_tour_5':
            await sendButtons(from,
                `📢 *Broadcast* (5 of 5)\n\n` +
                `Send a message to all your customers at once. Great for promotions, new product launches, or special announcements.\n\n` +
                `_Only customers who have interacted with your store will receive broadcasts._`,
                [{ id: 'ob_next', title: merchant.status === 'ACTIVE' ? 'Done ✅' : 'Next ▶' }]
            );
            break;

        case 'ob_terms': {
            const settings = await getPlatformSettings(db);
            const fee = Math.round(settings.platformFee * 100);
            await sendButtons(from,
                `📜 *Terms & Conditions*\n\n` +
                `By going live on Omeru, you agree to the following:\n\n` +
                `• All products must be accurately described and legally sold\n` +
                `• You will fulfil every order placed through the platform\n` +
                `• Platform fee: *${fee}%* per transaction\n` +
                `• Payouts are processed every *${settings.payoutDay}*\n` +
                `• You may not use the platform for fraud or illegal activity\n` +
                `• Omeru may suspend stores that violate these terms\n\n` +
                `_Do you accept these terms?_`,
                [
                    { id: 'ob_terms_agree', title: '✅ I Agree' },
                    { id: 'ob_next',        title: '🔄 Read again' }
                ]
            );
            break;
        }

        case 'ob_golive':
            await sendButtons(from,
                `🚀 *You're ready to go live!*\n\n` +
                `Your store *${name}* will now appear in Browse and customers can start ordering right away.\n\n` +
                `_You can always adjust your store settings later._`,
                [{ id: 'ob_golive_launch', title: '🚀 Launch my store!' }]
            );
            break;

        default:
            await sendTextMessage(from, '⚙️ Setup in progress. Type *menu* to continue.');
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const advanceTo = async (from: string, merchant: Merchant, step: string): Promise<void> => {
    await db.merchant.update({ where: { id: merchant.id }, data: { onboarding_step: step } });
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: step } });
    await sendStepMessage(from, merchant, step);
};

const generateHandle = async (name: string, excludeWaId?: string): Promise<string> => {
    let base = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
    if (base.length < 3) base = 'shop' + base;
    let handle = base;
    let i = 1;
    while (true) {
        const existing = await db.merchant.findFirst({ where: { handle } });
        if (!existing) break;
        if (excludeWaId && existing.wa_id === excludeWaId) break;
        handle = `${base}${i++}`;
    }
    return handle;
};
