import { PrismaClient, Mode, MerchantStatus } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();

/**
 * Handles the multi-step registration flow for merchants who have 
 * been "Authorized" by an Admin but haven't set up their store yet.
 */
export const handleOnboardingAction = async (from: string, input: string, session: any, merchant: any) => {
    
    // --- STEP 1: TRADING NAME (The Brand) ---
    if (!merchant.trading_name) {
        if (input.length < 3) {
            return sendTextMessage(from, "⚠️ Please provide a valid **Shop Name** (at least 3 characters). This is what students will see.");
        }
        await db.merchant.update({
            where: { wa_id: from },
            data: { trading_name: input }
        });
        return sendTextMessage(from, `✅ *${input}* sounds great!\n\nStep 2: What is the **Full Legal Name** of the owner or company? (Required for bank verification)`);
    }

    // --- STEP 2: LEGAL ENTITY NAME ---
    if (!merchant.legal_entity_name) {
        if (input.length < 3) return sendTextMessage(from, "⚠️ Please provide a full legal name.");
        await db.merchant.update({
            where: { wa_id: from },
            data: { legal_entity_name: input }
        });
        return sendTextMessage(from, "🔢 Step 3: Please reply with your **ID Number** or CIPC Registration Number.");
    }

    // --- STEP 3: ID/REGISTRATION NUMBER ---
    if (!merchant.id_number) {
        // Basic validation: Check if it's a reasonable length
        if (input.length < 6) return sendTextMessage(from, "⚠️ That looks too short. Please provide a valid ID/Reg number.");
        await db.merchant.update({
            where: { wa_id: from },
            data: { id_number: input }
        });
        return sendTextMessage(from, "🏦 Step 4: Almost done! Please provide your **Bank Details** so we can pay you on Fridays.\n\nFormat: *Bank Name, Account Number, Account Type*");
    }

    // --- STEP 4: BANK DETAILS (Parsing CSV format) ---
    if (!merchant.bank_acc_no) {
        const parts = input.split(',').map(p => p.trim());
        if (parts.length < 2) {
            return sendTextMessage(from, "❌ Invalid format. Please use: *Bank Name, Account Number, Type*\n\nExample: *FNB, 123456789, Savings*");
        }

        await db.merchant.update({
            where: { wa_id: from },
            data: { 
                bank_name: parts[0], 
                bank_acc_no: parts[1], 
                bank_type: parts[2] || 'Savings' 
            }
        });

        // --- STEP 5: THE LEGAL CONTRACT (Terms) ---
        const agreement = `📜 *OMERU MERCHANT TERMS*\n\n` +
                          `1. **Fees:** OMERU charges a 7% platform fee on all successful sales.\n` +
                          `2. **Payouts:** Funds are settled to your bank every Friday.\n` +
                          `3. **Reports:** Standard history is free. Deep reports (60/90 days) cost R5/R10.\n` +
                          `4. **Refunds:** Merchant covers the gateway fee on customer refunds.\n\n` +
                          `Click below to accept and open your shop!`;

        return sendButtons(from, agreement, [
            { id: 'ob_accept', title: '✅ I Accept & Launch' },
            { id: 'ob_cancel', title: '❌ Cancel' }
        ]);
    }

    // --- FINAL STEP: ACTIVATION ---
    if (input === 'ob_accept') {
        await db.merchant.update({
            where: { wa_id: from },
            data: { 
                accepted_terms: true,
                status: MerchantStatus.ACTIVE 
            }
        });

        // Switch user to Merchant Mode immediately
        await db.userSession.update({
            where: { wa_id: from },
            data: { mode: Mode.MERCHANT }
        });

        return sendButtons(from, `🎊 *CONGRATULATIONS!*\n\nYour shop **${merchant.trading_name}** is now ACTIVE.\n\nYou can now add your first product to the campus catalog.`, [
            { id: 'm_add_prod', title: '➕ Add Product' },
            { id: 'm_dashboard', title: '🏠 Dashboard' }
        ]);
    }

    if (input === 'ob_cancel') {
        // Reset process or send back to start
        return sendTextMessage(from, "Registration paused. You can restart by typing 'Hi'.");
    }
};