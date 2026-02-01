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

        // LOGS FOR DEBUGGING (Check these in Railway)
        console.log(`📩 New Message from ${from}: "${input}"`);
        console.log(`👤 Session Mode: ${session.mode}`);
        console.log(`🏬 Merchant Found: ${merchant ? merchant.trading_name : 'NO'}`);

        if (input === 'SwitchOmeru') {
            if (from === ADMIN_NUMBER) {
                return sendButtons(from, "🛠️ *Admin*", [
                    { id: 'set_mode_ADMIN', title: '💎 Admin' },
                    { id: 'set_mode_MERCHANT', title: '🏪 Merchant' },
                    { id: 'set_mode_CUSTOMER', title: '🛍️ Customer' }
                ]);
            } else if (merchant?.status === MerchantStatus.ACTIVE) {
                const next = session.mode === Mode.MERCHANT ? Mode.CUSTOMER : Mode.MERCHANT;
                await db.userSession.update({ where: { wa_id: from }, data: { mode: next } });
                return sendTextMessage(from, `🔄 Switched to: *${next}*`);
            }
        }

        if (input?.startsWith('set_mode_')) {
            const selectedMode = input.replace('set_mode_', '') as Mode;
            await db.userSession.update({ where: { wa_id: from }, data: { mode: selectedMode } });
            return sendTextMessage(from, `✅ Mode set to: *${selectedMode}*`);
        }

        // ROUTING
        if (session.mode === Mode.REGISTERING || (merchant && merchant.status !== MerchantStatus.ACTIVE)) {
            return handleOnboardingAction(from, input, session, merchant);
        }

        if (session.mode === Mode.MERCHANT) {
            if (!merchant) {
                // If mode is Merchant but no profile exists, reset them
                await db.userSession.update({ where: { wa_id: from }, data: { mode: Mode.CUSTOMER } });
                return sendTextMessage(from, "⚠️ Merchant profile missing. Reverted to Customer.");
            }
            return handleMerchantAction(from, input, session, merchant, message);
        }

        // DEFAULT CUSTOMER
        if (input?.toLowerCase() === 'hi' || input === 'start') {
            return sendTextMessage(from, "Welcome to Omeru! Type 'SwitchOmeru' to manage your shop.");
        }

    } catch (err: any) {
        // THIS LOG IS CRITICAL - It tells us exactly why the system error happens
        console.error("❌ CRITICAL HANDLER ERROR:", err.message);
        console.error("Stack Trace:", err.stack);
        return sendTextMessage(from, `⚠️ System Error: ${err.message}`);
    }
};