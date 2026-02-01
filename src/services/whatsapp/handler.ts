import { PrismaClient, Mode, MerchantStatus } from '@prisma/client';
import { handleMerchantAction } from './merchantEngine';
import { handleOnboardingAction } from './onboardingEngine';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();
const ADMIN_NUMBER = "27746854339";

export const handleIncomingMessage = async (webhookData: any) => {
    const value = webhookData.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    const input = message.interactive?.button_reply?.id || message.text?.body?.trim();

    try {
        let session = await db.userSession.findUnique({ where: { wa_id: from } });
        if (!session) {
            session = await db.userSession.create({ data: { wa_id: from, mode: Mode.CUSTOMER } });
        }
        const merchant = await db.merchant.findUnique({ where: { wa_id: from } });

        // --- ENHANCED ROLE SWITCHER ---
        if (input === 'SwitchOmeru') {
            if (from === ADMIN_NUMBER) {
                // Admin gets a choice
                return sendButtons(from, "🛠️ *Admin Command Center*\nSelect your active role:", [
                    { id: 'set_mode_ADMIN', title: '💎 Admin Mode' },
                    { id: 'set_mode_MERCHANT', title: '🏪 Merchant Mode' },
                    { id: 'set_mode_CUSTOMER', title: '🛍️ Customer Mode' }
                ]);
            } else if (merchant?.status === MerchantStatus.ACTIVE) {
                // Regular Merchant just toggles
                const next = session.mode === Mode.MERCHANT ? Mode.CUSTOMER : Mode.MERCHANT;
                await db.userSession.update({ where: { wa_id: from }, data: { mode: next } });
                return sendTextMessage(from, `🔄 Switched to: *${next}*`);
            }
        }

        // Handle the specific mode selection from Admin buttons
        if (input?.startsWith('set_mode_')) {
            const selectedMode = input.replace('set_mode_', '') as Mode;
            await db.userSession.update({ where: { wa_id: from }, data: { mode: selectedMode } });
            return sendTextMessage(from, `✅ Role activated: *${selectedMode}*`);
        }

        // --- ROUTING LOGIC ---

        // 1. ONBOARDING (For PENDING merchants)
        if (session.mode === Mode.REGISTERING || (merchant && merchant.status !== MerchantStatus.ACTIVE)) {
            return handleOnboardingAction(from, input, session, merchant);
        }

        // 2. MERCHANT ENGINE (For ACTIVE merchants)
        if (session.mode === Mode.MERCHANT && merchant?.status === MerchantStatus.ACTIVE) {
            return handleMerchantAction(from, input, session, merchant, message);
        }

        // 3. ADMIN ENGINE
        if (session.mode === Mode.ADMIN && from === ADMIN_NUMBER) {
            return sendTextMessage(from, "💎 *System Admin Dashboard*\n(Approve merchants, verify payouts, global stats)");
        }

        // 4. CUSTOMER ENGINE (Default)
        if (input?.toLowerCase() === 'hi' || input === 'start') {
            return sendTextMessage(from, "Welcome to Omeru! Type 'SwitchOmeru' to change roles.");
        }

    } catch (err) {
        console.error("Handler Error:", err);
        return sendTextMessage(from, "⚠️ System Error.");
    }
};