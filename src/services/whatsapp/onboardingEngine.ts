import { PrismaClient, MerchantStatus, Merchant, UserSession } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';
import {
    addProductLabel,
    alreadyRegisteredMessage,
    bankFormatWarningMessage,
    bankInvalidAccountMessage,
    bankSavedMessage,
    dashboardLabel,
    hoursCustomLabel,
    hoursFormatWarningMessage,
    hoursPromptMessage,
    hoursStandardLabel,
    hoursStepMessage,
    idInvalidMessage,
    idSavedMessage,
    legalNameInvalidMessage,
    legalNameSavedMessage,
    onboardingErrorMessage,
    registrationPausedMessage,
    termsAcceptLabel,
    termsAcceptedMessage,
    termsCancelLabel,
    termsMessage,
    tradingNameInvalidMessage,
    tradingNamePromptMessage,
    tradingNameSavedMessage,
    weekdayHoursSavedMessage
} from './templates';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

const STATE = {
    HOURS_MF: 'OB_HRS_MF',
    HOURS_SAT: 'OB_HRS_SAT'
};

export const handleOnboardingAction = async (
    from: string, 
    input: string, 
    session: UserSession, 
    merchant: Merchant | null, 
    message?: any
): Promise<void> => {
    try {
        // Cancel
        if (input.toLowerCase() === 'cancel' || input === 'ob_cancel') {
            await db.userSession.update({ where: { wa_id: from }, data: { mode: 'CUSTOMER', active_prod_id: null } });
            await sendTextMessage(from, registrationPausedMessage());
            return;
        }

        const step = getStep(merchant);

        switch (step) {
            case 1: await handleTradingName(from, input); break;
            case 2: await handleLegalName(from, input, merchant!); break;
            case 3: await handleIdNumber(from, input, merchant!); break;
            case 4: await handleBankDetails(from, input, merchant!); break;
            case 5: await handleHours(from, input, session, merchant!); break;
            case 6: await handleTerms(from, input, merchant!); break;
            default: await sendTextMessage(from, alreadyRegisteredMessage());
        }

    } catch (error: any) {
        console.error(`❌ Onboarding Error: ${error.message}`);
        await sendTextMessage(from, onboardingErrorMessage());
    }
};

const getStep = (m: Merchant | null): number => {
    if (!m || !m.trading_name) return 1;
    if (!m.legal_entity_name) return 2;
    if (!m.id_number) return 3;
    if (!m.bank_acc_no) return 4;
    if (!m.open_time) return 5;
    if (!m.accepted_terms) return 6;
    return 7;
};

const handleTradingName = async (from: string, input: string): Promise<void> => {
    if (!input || input.toLowerCase() === 'hi' || input.toLowerCase() === 'hello' || input.toLowerCase() === 'sell') {
        await sendTextMessage(from, tradingNamePromptMessage());
        return;
    }

    if (input.length < 3 || input.length > 50) {
        await sendTextMessage(from, tradingNameInvalidMessage());
        return;
    }

    const handle = await generateHandle(input);
    
    await db.merchant.upsert({
        where: { wa_id: from },
        update: { trading_name: input.trim(), handle },
        create: { wa_id: from, trading_name: input.trim(), handle, status: MerchantStatus.ONBOARDING }
    });

    await sendTextMessage(from, tradingNameSavedMessage(input.trim(), handle));
};

const handleLegalName = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    if (input.length < 3) {
        await sendTextMessage(from, legalNameInvalidMessage());
        return;
    }

    await db.merchant.update({ where: { wa_id: from }, data: { legal_entity_name: input.trim() } });
    await sendTextMessage(from, legalNameSavedMessage(input.trim()));
};

const handleIdNumber = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    const clean = input.replace(/[\s-]/g, '').toUpperCase();
    
    if (clean.length < 6) {
        await sendTextMessage(from, idInvalidMessage());
        return;
    }

    await db.merchant.update({ where: { wa_id: from }, data: { id_number: clean } });
    await sendTextMessage(from, idSavedMessage());
};

const handleBankDetails = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    const parts = input.split(',').map(p => p.trim());
    
    if (parts.length < 2) {
        await sendTextMessage(from, bankFormatWarningMessage());
        return;
    }

    const [bank, acc, type = 'Savings'] = parts;
    const cleanAcc = acc.replace(/\D/g, '');

    if (cleanAcc.length < 6) {
        await sendTextMessage(from, bankInvalidAccountMessage());
        return;
    }

    await db.merchant.update({ 
        where: { wa_id: from }, 
        data: { bank_name: bank, bank_acc_no: cleanAcc, bank_type: type } 
    });

    await sendButtons(from, bankSavedMessage(bank, cleanAcc.slice(-4)), [
        { id: 'ob_hours_def', title: hoursStandardLabel() },
        { id: 'ob_hours_cust', title: hoursCustomLabel() }
    ]);
};

const handleHours = async (from: string, input: string, session: UserSession, merchant: Merchant): Promise<void> => {
    const state = session.active_prod_id || '';

    if (input === 'ob_hours_def') {
        await db.merchant.update({ 
            where: { wa_id: from }, 
            data: { open_time: '09:00', close_time: '17:00', sat_open_time: '10:00', sat_close_time: '15:00', sun_open: false } 
        });
        await showTerms(from);
        return;
    }

    if (input === 'ob_hours_cust') {
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: STATE.HOURS_MF } });
        await sendTextMessage(from, hoursPromptMessage());
        return;
    }

    if (state === STATE.HOURS_MF) {
        if (input.toLowerCase() === 'closed') {
            await db.merchant.update({ where: { wa_id: from }, data: { open_time: '00:00', close_time: '00:00' } });
        } else if (input.includes('-')) {
            const [o, c] = input.split('-').map(s => s.trim());
            await db.merchant.update({ where: { wa_id: from }, data: { open_time: o, close_time: c } });
        } else {
            await sendTextMessage(from, hoursFormatWarningMessage());
            return;
        }
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: STATE.HOURS_SAT } });
        await sendTextMessage(from, weekdayHoursSavedMessage());
        return;
    }

    if (state === STATE.HOURS_SAT) {
        if (input.toLowerCase() === 'closed') {
            await db.merchant.update({ where: { wa_id: from }, data: { sat_open_time: '00:00', sat_close_time: '00:00', sun_open: false } });
        } else if (input.includes('-')) {
            const [o, c] = input.split('-').map(s => s.trim());
            await db.merchant.update({ where: { wa_id: from }, data: { sat_open_time: o, sat_close_time: c, sun_open: false } });
        } else {
            await sendTextMessage(from, hoursFormatWarningMessage());
            return;
        }
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        await showTerms(from);
        return;
    }

    // Show hours menu if no state
    await sendButtons(from, hoursStepMessage(), [
        { id: 'ob_hours_def', title: hoursStandardLabel() },
        { id: 'ob_hours_cust', title: hoursCustomLabel() }
    ]);
};

const showTerms = async (from: string): Promise<void> => {
    await sendButtons(from, termsMessage(), [
        { id: 'ob_accept', title: termsAcceptLabel() },
        { id: 'ob_cancel', title: termsCancelLabel() }
    ]);
};

const handleTerms = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    if (input === 'ob_accept') {
        await db.merchant.update({ 
            where: { wa_id: from }, 
            data: { accepted_terms: true, status: MerchantStatus.ACTIVE } 
        });
        await db.userSession.update({ where: { wa_id: from }, data: { mode: 'MERCHANT', active_prod_id: null } });

        await sendButtons(from, termsAcceptedMessage(merchant.trading_name, merchant.handle), [
            { id: 'm_add_prod', title: addProductLabel() },
            { id: 'm_dashboard', title: dashboardLabel() }
        ]);
        return;
    }

    await showTerms(from);
};

const generateHandle = async (name: string): Promise<string> => {
    let base = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
    if (base.length < 3) base = 'shop' + base;
    
    let handle = base;
    let i = 1;
    while (await db.merchant.findFirst({ where: { handle } })) {
        handle = `${base}${i++}`;
    }
    return handle;
};
