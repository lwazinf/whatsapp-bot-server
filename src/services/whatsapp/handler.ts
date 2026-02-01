import { PrismaClient, Mode, MerchantStatus } from '@prisma/client';
import { handleMerchantAction } from './merchantEngine';
import { handleOnboardingAction } from './onboardingEngine';
import { sendTextMessage } from './sender';

const db = new PrismaClient();
const ADMIN_NUMBER = "27746854339";

export const handleIncomingMessage = async (webhookData: any) => {
    const value = webhookData.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    const input = message.interactive?.button_reply?.id || message.text?.body?.trim();
    const messageType = message.type;

    try {
        // 1. Session & Merchant Lookup
        let session = await db.userSession.findUnique({ where: { wa_id: from } });
        if (!session) {
            session = await db.userSession.create({ 
                data: { wa_id: from, mode: Mode.CUSTOMER } 
            });
        }
        const merchant = await db.merchant.findUnique({ where: { wa_id: from } });

        // 2. Global Role Switcher
        if (input === 'SwitchOmeru') {
            let nextMode: Mode = Mode.CUSTOMER;
            
            if (from === ADMIN_NUMBER) {
                if (session.mode === Mode.ADMIN) nextMode = Mode.MERCHANT;
                else if (session.mode === Mode.MERCHANT) nextMode = Mode.CUSTOMER;
                else nextMode = Mode.ADMIN;
            } else if (merchant?.status === MerchantStatus.ACTIVE) {
                nextMode = (session.mode === Mode.MERCHANT) ? Mode.CUSTOMER : Mode.MERCHANT;
            }

            await db.userSession.update({
                where: { wa_id: from },
                data: { mode: nextMode }
            });
            return sendTextMessage(from, `🔄 Switched to: *${nextMode}*`);
        }

        // 3. Routing: Onboarding (Pending Merchants)
        // Check for REGISTERING mode OR a merchant profile that isn't ACTIVE yet
        if (session.mode === Mode.REGISTERING || (merchant && merchant.status !== MerchantStatus.ACTIVE)) {
            return handleOnboardingAction(from, input, session, merchant);
        }

        // 4. Routing: Merchant Engine (Active Business)
        if (session.mode === Mode.MERCHANT && merchant && merchant.status === MerchantStatus.ACTIVE) {
            return handleMerchantAction(from, input, session, merchant, message);
        }

        // 5. Routing: Admin (God Mode)
        if (session.mode === Mode.ADMIN) {
            return sendTextMessage(from, "💎 *Admin Mode Active*\n\n1. View Payouts\n2. Approve Merchants\n\nType 'SwitchOmeru' to exit.");
        }

        // 6. Default: Customer Mode
        if (input?.toLowerCase() === 'hi') {
            return sendTextMessage(from, "Welcome to Omeru! 🛍️\n\nTo manage a shop, use the 'SwitchOmeru' command.");
        }

    } catch (err) {
        console.error("❌ Handler Error:", err);
        return sendTextMessage(from, "⚠️ System error. Please try again.");
    }
};