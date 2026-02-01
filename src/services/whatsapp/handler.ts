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

    try {
        let session = await db.userSession.findUnique({ where: { wa_id: from } });
        if (!session) session = await db.userSession.create({ data: { wa_id: from, mode: Mode.CUSTOMER } });
        const merchant = await db.merchant.findUnique({ where: { wa_id: from } });

        // ROLE SWITCHER
        if (input === 'SwitchOmeru') {
            let nextMode: Mode = Mode.CUSTOMER;
            if (from === ADMIN_NUMBER) {
                if (session.mode === Mode.ADMIN) nextMode = Mode.MERCHANT;
                else if (session.mode === Mode.MERCHANT) nextMode = Mode.CUSTOMER;
                else nextMode = Mode.ADMIN;
            } else if (merchant?.status === MerchantStatus.ACTIVE) {
                nextMode = (session.mode === Mode.MERCHANT) ? Mode.CUSTOMER : Mode.MERCHANT;
            }
            await db.userSession.update({ where: { wa_id: from }, data: { mode: nextMode } });
            return sendTextMessage(from, `🔄 Switched to: *${nextMode}*`);
        }

        // ROUTING: ONBOARDING
        if (session.mode === Mode.REGISTERING || (merchant && merchant.status !== MerchantStatus.ACTIVE)) {
            return handleOnboardingAction(from, input, session, merchant);
        }

        // ROUTING: MERCHANT ENGINE (Passes the full message for images/location)
        if (session.mode === Mode.MERCHANT && merchant?.status === MerchantStatus.ACTIVE) {
            return handleMerchantAction(from, input, session, merchant, message);
        }

        // DEFAULT CUSTOMER
        if (input?.toLowerCase() === 'hi') {
            return sendTextMessage(from, "Welcome to Omeru! Type 'SwitchOmeru' to explore.");
        }

    } catch (err) {
        console.error("Handler Error:", err);
        return sendTextMessage(from, "⚠️ System Error.");
    }
};