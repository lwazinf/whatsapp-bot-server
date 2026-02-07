import { PrismaClient, MerchantStatus, Merchant, UserSession } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

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
            await sendTextMessage(from, '📋 Registration paused. Type *sell* to continue later.');
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
            default: await sendTextMessage(from, '✅ Already registered!');
        }

    } catch (error: any) {
        console.error(`❌ Onboarding Error: ${error.message}`);
        await sendTextMessage(from, '❌ Error. Try again or type *cancel*.');
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
        await sendTextMessage(from, 
            '🏪 *Welcome to Omeru!*\n\n' +
            "Let's set up your shop.\n\n" +
            '📝 *Step 1/6: Shop Name*\n' +
            'What is your trading name?'
        );
        return;
    }

    const { tradingName, customAdminHandle } = parseTradingNameInput(input);

    if (tradingName.length < 3 || tradingName.length > 50) {
        await sendTextMessage(from, '⚠️ Name must be 3-50 characters.');
        return;
    }

    const handle = await generateHandle(tradingName);
    const adminHandle = await generateAdminHandle(handle, customAdminHandle, from);
    
    await db.merchant.upsert({
        where: { wa_id: from },
        update: { trading_name: tradingName.trim(), handle, admin_handle: adminHandle },
        create: { wa_id: from, trading_name: tradingName.trim(), handle, admin_handle: adminHandle, status: MerchantStatus.ONBOARDING }
    });

    await sendTextMessage(from, 
        `✅ *${tradingName}* (@${handle})\n` +
        `🔐 Admin: @${adminHandle}\n\n` +
        '📝 *Step 2/6: Owner Details*\n' +
        'Full legal name of owner/company?'
    );
};

const handleLegalName = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    if (input.length < 3) {
        await sendTextMessage(from, '⚠️ Please enter a valid name.');
        return;
    }

    await db.merchant.update({ where: { wa_id: from }, data: { legal_entity_name: input.trim() } });
    await sendTextMessage(from, 
        `✅ ${input.trim()}\n\n` +
        '📝 *Step 3/6: ID*\n' +
        'SA ID (13 digits) or CIPC number?'
    );
};

const handleIdNumber = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    const clean = input.replace(/[\s-]/g, '').toUpperCase();
    
    if (clean.length < 6) {
        await sendTextMessage(from, '⚠️ Invalid ID. Enter 13-digit SA ID or CIPC number.');
        return;
    }

    await db.merchant.update({ where: { wa_id: from }, data: { id_number: clean } });
    await sendTextMessage(from, 
        '✅ ID saved.\n\n' +
        '📝 *Step 4/6: Bank Details*\n\n' +
        'Format: *Bank, Account Number, Type*\n\n' +
        '_Example: FNB, 62845678901, Cheque_'
    );
};

const handleBankDetails = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    const parts = input.split(',').map(p => p.trim());
    
    if (parts.length < 2) {
        await sendTextMessage(from, '⚠️ Use format: Bank, Account Number, Type');
        return;
    }

    const [bank, acc, type = 'Savings'] = parts;
    const cleanAcc = acc.replace(/\D/g, '');

    if (cleanAcc.length < 6) {
        await sendTextMessage(from, '⚠️ Invalid account number.');
        return;
    }

    await db.merchant.update({ 
        where: { wa_id: from }, 
        data: { bank_name: bank, bank_acc_no: cleanAcc, bank_type: type } 
    });

    await sendButtons(from, 
        `✅ ${bank} ****${cleanAcc.slice(-4)}\n\n` +
        '📝 *Step 5/6: Hours*\n\n' +
        'When are you open?',
        [
            { id: 'ob_hours_def', title: '✅ Standard Hours' },
            { id: 'ob_hours_cust', title: '✏️ Custom Hours' }
        ]
    );
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
        await sendTextMessage(from, '⏰ Mon-Fri hours?\n\n*HH:MM - HH:MM*\n\nExample: 08:00 - 18:00\nOr "closed"');
        return;
    }

    if (state === STATE.HOURS_MF) {
        if (input.toLowerCase() === 'closed') {
            await db.merchant.update({ where: { wa_id: from }, data: { open_time: '00:00', close_time: '00:00' } });
        } else if (input.includes('-')) {
            const [o, c] = input.split('-').map(s => s.trim());
            await db.merchant.update({ where: { wa_id: from }, data: { open_time: o, close_time: c } });
        } else {
            await sendTextMessage(from, '⚠️ Use: HH:MM - HH:MM');
            return;
        }
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: STATE.HOURS_SAT } });
        await sendTextMessage(from, '✅ Weekdays set.\n\nNow Saturday?\n\nOr "closed"');
        return;
    }

    if (state === STATE.HOURS_SAT) {
        if (input.toLowerCase() === 'closed') {
            await db.merchant.update({ where: { wa_id: from }, data: { sat_open_time: '00:00', sat_close_time: '00:00', sun_open: false } });
        } else if (input.includes('-')) {
            const [o, c] = input.split('-').map(s => s.trim());
            await db.merchant.update({ where: { wa_id: from }, data: { sat_open_time: o, sat_close_time: c, sun_open: false } });
        } else {
            await sendTextMessage(from, '⚠️ Use: HH:MM - HH:MM');
            return;
        }
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        await showTerms(from);
        return;
    }

    // Show hours menu if no state
    await sendButtons(from, '📝 *Step 5/6: Hours*', [
        { id: 'ob_hours_def', title: '✅ Standard Hours' },
        { id: 'ob_hours_cust', title: '✏️ Custom Hours' }
    ]);
};

const showTerms = async (from: string): Promise<void> => {
    await sendButtons(from, 
        '📜 *Step 6/6: Terms*\n\n' +
        '• Platform Fee: 7%\n' +
        '• Payouts: Every Friday\n' +
        '• Keep store open during hours\n\n' +
        'Accept terms?',
        [
            { id: 'ob_accept', title: '✅ I Accept' },
            { id: 'ob_cancel', title: '❌ Cancel' }
        ]
    );
};

const handleTerms = async (from: string, input: string, merchant: Merchant): Promise<void> => {
    if (input === 'ob_accept') {
        await db.merchant.update({ 
            where: { wa_id: from }, 
            data: { accepted_terms: true, status: MerchantStatus.ACTIVE } 
        });
        await db.userSession.update({ where: { wa_id: from }, data: { mode: 'MERCHANT', active_prod_id: null } });

        await sendButtons(from, 
            `🎉 *Congratulations!*\n\n` +
            `*${merchant.trading_name}* is LIVE!\n` +
            `📱 @${merchant.handle}\n\n` +
            'Add your first product!',
            [
                { id: 'm_add_prod', title: '➕ Add Product' },
                { id: 'm_dashboard', title: '🏪 Dashboard' }
            ]
        );
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

const parseTradingNameInput = (input: string): { tradingName: string; customAdminHandle?: string } => {
    const [namePart, adminPart] = input.split('|').map(part => part.trim()).filter(Boolean);
    return { tradingName: namePart || input.trim(), customAdminHandle: adminPart };
};

const generateAdminHandle = async (handle: string, customAdminHandle: string | undefined, waId: string): Promise<string> => {
    const normalizedCustom = customAdminHandle
        ? customAdminHandle.toLowerCase().replace(/[^a-z0-9_]/g, '')
        : '';
    let base = normalizedCustom || `${handle}_admin`;
    if (!base.endsWith('_admin')) {
        base = `${base}_admin`;
    }

    let adminHandle = base;
    let i = 1;
    while (await db.merchant.findFirst({ where: { admin_handle: adminHandle, NOT: { wa_id: waId } } })) {
        adminHandle = `${base}${i++}`;
    }
    return adminHandle;
};
