import { PrismaClient, Merchant, UserSession } from '@prisma/client';
import { sendTextMessage, sendButtons, sendListMessage } from './sender';
import { normalizeWaId } from './waId';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

const STATE = {
    BIO: 'SET_BIO',
    LOGO: 'SET_LOGO',
    ADDRESS: 'SET_ADDR',
    HOURS_MF: 'SET_HRS_MF',
    HOURS_SAT: 'SET_HRS_SAT',
    OWNER_ADD: 'SET_OWNER_ADD'
};

export const handleSettingsActions = async (
    from: string, 
    input: string, 
    session: UserSession, 
    merchant: Merchant, 
    message?: any
): Promise<void> => {
    try {
        const state = session.active_prod_id || '';

        // Main Settings Menu
        if (input === 'm_settings' || input === 's_back') {
            await clearState(from);
            const status = merchant.manual_closed ? '🔴 CLOSED' : '🟢 OPEN';
            
            await sendButtons(from, 
                `🛠️ *Settings*\n\n🏪 ${merchant.trading_name}\n${status}\n\n📝 ${merchant.description || '_No bio_'}\n📍 ${merchant.address || '_No address_'}`,
                [
                    { id: 's_profile', title: '👤 Edit Profile' },
                    { id: 's_hours', title: '⏰ Hours' },
                    { id: 's_owners', title: '👥 Owners' }
                ]
            );
            await sendButtons(from, 'Actions:', [
                { id: 's_toggle', title: merchant.manual_closed ? '🔓 Open Shop' : '🔒 Close Shop' }
            ]
            );
            await sendButtons(from, 'Nav:', [{ id: 'm_dashboard', title: '🏠 Dashboard' }]);
            return;
        }

        // Profile Menu
        if (input === 's_profile') {
            await sendButtons(from, '👤 *Edit Profile*', [
                { id: 's_bio', title: '📝 Description' },
                { id: 's_logo', title: '📸 Logo' },
                { id: 's_addr', title: '📍 Address' }
            ]);
            await sendButtons(from, 'Nav:', [{ id: 's_back', title: '⬅️ Back' }]);
            return;
        }

        if (input === 's_owners') {
            const owners = await db.merchantOwner.findMany({
                where: { merchant_id: merchant.id },
                orderBy: { createdAt: 'asc' }
            });
            const ownerLines = owners.map(owner => `• ${owner.wa_id}${owner.is_admin ? ' (admin)' : ''}`);

            await sendTextMessage(
                from,
                `👥 *Store Owners*\n\n${ownerLines.length > 0 ? ownerLines.join('\n') : '_No owners yet_'}`
            );
            await sendButtons(from, 'Owner Actions:', [
                { id: 's_owner_add', title: '➕ Add Owner' },
                { id: 's_owner_remove', title: '🗑️ Remove' }
            ]);
            await sendButtons(from, 'Nav:', [{ id: 's_back', title: '⬅️ Back' }]);
            return;
        }

        if (input === 's_owner_add') {
            await setState(from, STATE.OWNER_ADD);
            await sendTextMessage(from, '👥 Add owner\n\nSend phone number (e.g., +27712345678).');
            return;
        }

        if (state === STATE.OWNER_ADD) {
            const normalized = normalizeWaId(input);
            if (normalized.length < 9) {
                await sendTextMessage(from, '⚠️ Please provide a valid phone number.');
                return;
            }
            await db.merchantOwner.upsert({
                where: { merchant_id_wa_id: { merchant_id: merchant.id, wa_id: normalized } },
                update: { is_admin: true, role: 'OWNER' },
                create: { merchant_id: merchant.id, wa_id: normalized, is_admin: true, role: 'OWNER' }
            });
            await clearState(from);
            await sendTextMessage(from, `✅ Added owner ${normalized}.`);
            await handleSettingsActions(from, 's_owners', session, merchant);
            return;
        }

        if (input === 's_owner_remove') {
            const owners = await db.merchantOwner.findMany({
                where: { merchant_id: merchant.id },
                orderBy: { createdAt: 'asc' }
            });
            if (owners.length === 0) {
                await sendTextMessage(from, '📭 No owners to remove.');
                return;
            }

            await sendListMessage(
                from,
                '🗑️ *Remove Owner*',
                'Select',
                [
                    {
                        title: 'Owners',
                        rows: owners.map(owner => ({
                            id: `s_owner_remove_${owner.id}`,
                            title: owner.wa_id,
                            description: owner.is_admin ? 'Admin' : undefined
                        }))
                    }
                ]
            );
            return;
        }

        if (input.startsWith('s_owner_remove_')) {
            const ownerId = input.replace('s_owner_remove_', '');
            await db.merchantOwner.delete({ where: { id: ownerId } });
            await sendTextMessage(from, '✅ Owner removed.');
            await handleSettingsActions(from, 's_owners', session, merchant);
            return;
        }

        // Bio
        if (input === 's_bio') {
            await setState(from, STATE.BIO);
            await sendTextMessage(from, `📝 *Description*\n\nCurrent: ${merchant.description || '_Not set_'}\n\nType your new description (or "clear" to remove):`);
            return;
        }

        if (state === STATE.BIO) {
            const newBio = input.toLowerCase() === 'clear' ? null : input.substring(0, 200);
            await db.merchant.update({ where: { id: merchant.id }, data: { description: newBio } });
            await clearState(from);
            await sendTextMessage(from, newBio ? '✅ Description updated!' : '✅ Description cleared.');
            await handleSettingsActions(from, 's_profile', session, merchant);
            return;
        }

        // Logo
        if (input === 's_logo') {
            await setState(from, STATE.LOGO);
            await sendButtons(from, '📸 Send an image for your logo.', [
                { id: 's_clear_logo', title: '🗑️ Remove Logo' },
                { id: 's_cancel', title: '❌ Cancel' }
            ]);
            return;
        }

        if (state === STATE.LOGO) {
            if (message?.type === 'image' && message?.image?.id) {
                await db.merchant.update({ where: { id: merchant.id }, data: { image_url: message.image.id } });
                await clearState(from);
                await sendTextMessage(from, '✅ Logo updated!');
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }
            if (input === 's_clear_logo') {
                await db.merchant.update({ where: { id: merchant.id }, data: { image_url: null } });
                await clearState(from);
                await sendTextMessage(from, '✅ Logo removed.');
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }
            if (input === 's_cancel') {
                await clearState(from);
                await handleSettingsActions(from, 's_profile', session, merchant);
                return;
            }
            await sendButtons(from, '⚠️ Send an image.', [{ id: 's_cancel', title: '❌ Cancel' }]);
            return;
        }

        // Address
        if (input === 's_addr') {
            await setState(from, STATE.ADDRESS);
            await sendTextMessage(from, `📍 *Address*\n\nCurrent: ${merchant.address || '_Not set_'}\n\nType address or send location pin (or "clear"):`);
            return;
        }

        if (state === STATE.ADDRESS) {
            let addr: string | null = input;
            if (message?.type === 'location') {
                addr = `📍 ${message.location.latitude}, ${message.location.longitude}`;
            } else if (input.toLowerCase() === 'clear') {
                addr = null;
            }
            await db.merchant.update({ where: { id: merchant.id }, data: { address: addr } });
            await clearState(from);
            await sendTextMessage(from, addr ? '✅ Address updated!' : '✅ Address cleared.');
            await handleSettingsActions(from, 's_profile', session, merchant);
            return;
        }

        // Toggle Open/Close
        if (input === 's_toggle') {
            const updated = await db.merchant.update({ 
                where: { id: merchant.id }, 
                data: { manual_closed: !merchant.manual_closed } 
            });
            await sendTextMessage(from, `🚦 Shop is now ${updated.manual_closed ? '*CLOSED* 🔴' : '*OPEN* 🟢'}`);
            await handleSettingsActions(from, 'm_settings', session, updated);
            return;
        }

        // Hours Menu
        if (input === 's_hours') {
            const mf = formatHours(merchant.open_time, merchant.close_time);
            const sat = formatHours(merchant.sat_open_time, merchant.sat_close_time);
            
            await sendButtons(from, 
                `⏰ *Trading Hours*\n\nMon-Fri: ${mf}\nSat: ${sat}\nSun: ${merchant.sun_open ? 'Open' : 'Closed'}`,
                [
                    { id: 'h_default', title: '✅ Standard Hours' },
                    { id: 'h_mf', title: '✏️ Mon-Fri' },
                    { id: 'h_sat', title: '✏️ Saturday' }
                ]
            );
            await sendButtons(from, 'More:', [
                { id: 'h_sun', title: `☀️ Sun (${merchant.sun_open ? 'On' : 'Off'})` },
                { id: 's_back', title: '⬅️ Back' }
            ]);
            return;
        }

        if (input === 'h_default') {
            await db.merchant.update({ 
                where: { id: merchant.id }, 
                data: { open_time: '09:00', close_time: '17:00', sat_open_time: '10:00', sat_close_time: '15:00', sun_open: false } 
            });
            await sendTextMessage(from, '✅ Standard hours set.');
            const updated = await db.merchant.findUnique({ where: { id: merchant.id } });
            await handleSettingsActions(from, 's_hours', session, updated!);
            return;
        }

        if (input === 'h_mf') {
            await setState(from, STATE.HOURS_MF);
            await sendTextMessage(from, '⏰ Enter Mon-Fri hours:\n\n*HH:MM - HH:MM*\n\nExample: 08:30 - 17:00\nOr type "closed"');
            return;
        }

        if (input === 'h_sat') {
            await setState(from, STATE.HOURS_SAT);
            await sendTextMessage(from, '⏰ Enter Saturday hours:\n\n*HH:MM - HH:MM*\n\nOr type "closed"');
            return;
        }

        if (input === 'h_sun') {
            const updated = await db.merchant.update({ where: { id: merchant.id }, data: { sun_open: !merchant.sun_open } });
            await sendTextMessage(from, `✅ Sunday is now ${updated.sun_open ? 'OPEN' : 'CLOSED'}`);
            await handleSettingsActions(from, 's_hours', session, updated);
            return;
        }

        if (state === STATE.HOURS_MF || state === STATE.HOURS_SAT) {
            const isSat = state === STATE.HOURS_SAT;
            
            if (input.toLowerCase() === 'closed') {
                const data = isSat 
                    ? { sat_open_time: '00:00', sat_close_time: '00:00' }
                    : { open_time: '00:00', close_time: '00:00' };
                await db.merchant.update({ where: { id: merchant.id }, data });
            } else if (input.includes('-')) {
                const [open, close] = input.split('-').map(s => s.trim());
                const data = isSat 
                    ? { sat_open_time: open, sat_close_time: close }
                    : { open_time: open, close_time: close };
                await db.merchant.update({ where: { id: merchant.id }, data });
            } else {
                await sendTextMessage(from, '⚠️ Use format: HH:MM - HH:MM');
                return;
            }
            
            await clearState(from);
            await sendTextMessage(from, '✅ Hours updated!');
            const updated = await db.merchant.findUnique({ where: { id: merchant.id } });
            await handleSettingsActions(from, 's_hours', session, updated!);
            return;
        }

        // Fallback
        await handleSettingsActions(from, 'm_settings', session, merchant);

    } catch (error: any) {
        console.error(`❌ Settings Error: ${error.message}`);
        await clearState(from);
        await sendTextMessage(from, '❌ Error occurred.');
    }
};

const setState = async (from: string, state: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: state } });
};

const clearState = async (from: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
};

const formatHours = (open: string | null, close: string | null): string => {
    if (!open || !close || (open === '00:00' && close === '00:00')) return 'Closed';
    return `${open} - ${close}`;
};
