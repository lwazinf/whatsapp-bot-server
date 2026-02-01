import { PrismaClient, Mode, MerchantStatus } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();

/**
 * Handles the multi-step registration flow for merchants.
 * Optimized with Operating Hours and validation logic.
 */
export const handleOnboardingAction = async (from: string, input: string, session: any, merchant: any) => {
    
    // --- STEP 1: TRADING NAME ---
    if (!merchant.trading_name) {
        if (input.length < 3) {
            return sendTextMessage(from, "⚠️ Please provide a valid **Shop Name** (at least 3 characters).");
        }
        await db.merchant.update({ where: { wa_id: from }, data: { trading_name: input } });
        return sendTextMessage(from, `✅ *${input}* sounds great!\n\nStep 2: What is the **Full Legal Name** of the owner or company?`);
    }

    // --- STEP 2: LEGAL ENTITY NAME ---
    if (!merchant.legal_entity_name) {
        if (input.length < 3) return sendTextMessage(from, "⚠️ Please provide a full legal name.");
        await db.merchant.update({ where: { wa_id: from }, data: { legal_entity_name: input } });
        return sendTextMessage(from, "🔢 Step 3: Please reply with your **ID Number** or CIPC Registration Number.");
    }

    // --- STEP 3: ID/REGISTRATION NUMBER ---
    if (!merchant.id_number) {
        if (input.length < 6) return sendTextMessage(from, "⚠️ That looks too short. Please provide a valid ID/Reg number.");
        await db.merchant.update({ where: { wa_id: from }, data: { id_number: input } });
        return sendTextMessage(from, "🏦 Step 4: Please provide your **Bank Details**.\n\nFormat: *Bank Name, Account Number, Account Type*");
    }

    // --- STEP 4: BANK DETAILS ---
    if (!merchant.bank_acc_no) {
        const parts = input.split(',').map(p => p.trim());
        if (parts.length < 2) {
            return sendTextMessage(from, "❌ Invalid format. Please use: *Bank Name, Account Number, Type*");
        }

        await db.merchant.update({
            where: { wa_id: from },
            data: { 
                bank_name: parts[0], 
                bank_acc_no: parts[1], 
                bank_type: parts[2] || 'Savings' 
            }
        });

        // --- NEW STEP: OPERATING HOURS SELECTION ---
        return sendButtons(from, "⏰ *Step 5: Operating Hours*\nStudents need to know when you are open. Default is **08:00 - 17:00**.", [
            { id: 'ob_hours_def', title: '✅ Use Defaults' },
            { id: 'ob_hours_cust', title: '✏️ Set Custom' }
        ]);
    }

    // Handle Hours Choice
    if (input === 'ob_hours_def') {
        await db.merchant.update({ where: { wa_id: from }, data: { open_time: "08:00", close_time: "17:00" } });
        return sendLegalAgreement(from);
    }

    if (input === 'ob_hours_cust') {
        // Use active_prod_id as a temporary state holder for custom hours
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: 'SET_HOURS' } });
        return sendTextMessage(from, "Please enter your hours in 24h format: *HH:MM - HH:MM*\n\nExample: *09:00 - 21:00*");
    }

    // Handle Custom Hours Input
    if (session.active_prod_id === 'SET_HOURS') {
        const hoursRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?-\s?([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!hoursRegex.test(input)) {
            return sendTextMessage(from, "❌ Invalid format. Please use *HH:MM - HH:MM* (e.g. 08:30 - 18:00)");
        }
        const [open, close] = input.split('-').map(s => s.trim());
        await db.merchant.update({ where: { wa_id: from }, data: { open_time: open, close_time: close } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        return sendLegalAgreement(from);
    }

    // --- STEP 6: FINAL ACTIVATION ---
    if (input === 'ob_accept') {
        await db.merchant.update({
            where: { wa_id: from },
            data: { 
                accepted_terms: true,
                status: MerchantStatus.ACTIVE 
            }
        });

        await db.userSession.update({
            where: { wa_id: from },
            data: { mode: Mode.MERCHANT }
        });

        return sendButtons(from, `🎊 *CONGRATULATIONS!*\n\nYour shop **${merchant.trading_name}** is now ACTIVE.`, [
            { id: 'm_add_prod', title: '➕ Add Product' },
            { id: 'm_kitchen', title: '🍳 Kitchen View' }
        ]);
    }

    if (input === 'ob_cancel') {
        return sendTextMessage(from, "Registration paused. You can restart by typing 'Hi'.");
    }
};

/**
 * Reusable helper to send the Merchant Agreement
 */
const sendLegalAgreement = (to: string) => {
    const agreement = `📜 *OMERU MERCHANT TERMS*\n\n` +
                      `1. **Fees:** 7% platform fee on sales.\n` +
                      `2. **Payouts:** Every Friday.\n` +
                      `3. **Refunds:** Merchant covers gateway fees.\n\n` +
                      `Click below to accept and launch!`;

    return sendButtons(to, agreement, [
        { id: 'ob_accept', title: '✅ I Accept & Launch' },
        { id: 'ob_cancel', title: '❌ Cancel' }
    ]);
};