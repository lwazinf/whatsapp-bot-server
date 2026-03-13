import axios from 'axios';
import { sendTextMessage, sendButtons, sendListMessage } from './sender';
import { db } from '../../lib/db';

export const getCustomerAddress = async (waId: string): Promise<string | null> => {
    const session = await db.userSession.findUnique({
        where: { wa_id: waId },
        select: { delivery_address: true }
    });
    return (session as any)?.delivery_address ?? null;
};

export const startAddressFlow = async (from: string, returnAction: string | null): Promise<void> => {
    await db.userSession.update({
        where: { wa_id: from },
        data: {
            active_prod_id: 'ADDR_FLOW',
            state: JSON.stringify({ returnAction, step: 'input' })
        }
    });
    await sendTextMessage(from,
        '📍 *Enter Delivery Address*\n\n' +
        'Drop a location pin 📌 or type your address below.\n\n' +
        '_Tap the attachment 📎 icon to share your location._'
    );
};

const confirmAddress = async (from: string, address: string, returnAction: string | null): Promise<void> => {
    await (db.userSession.update as any)({
        where: { wa_id: from },
        data: {
            delivery_address: address,
            active_prod_id: null,
            state: null
        }
    });

    if (returnAction) {
        await sendButtons(from,
            `✅ *Address saved!*\n\n📍 ${address}`,
            [
                { id: returnAction, title: '→ Continue Order' },
                { id: 'c_account', title: '↩️ My Account' }
            ]
        );
    } else {
        await sendButtons(from,
            `✅ *Address saved!*\n\n📍 ${address}`,
            [{ id: 'c_account', title: '↩️ My Account' }]
        );
    }
};

const handleLocationPin = async (from: string, lat: number, lng: number, returnAction: string | null): Promise<void> => {
    try {
        const headers = { 'User-Agent': 'OmeruBot/1.0' };
        const timeout = 5000;

        const [res18, res16] = await Promise.all([
            axios.get('https://nominatim.openstreetmap.org/reverse', {
                params: { format: 'json', lat, lon: lng, zoom: 18 },
                headers,
                timeout
            }),
            axios.get('https://nominatim.openstreetmap.org/reverse', {
                params: { format: 'json', lat, lon: lng, zoom: 16 },
                headers,
                timeout
            })
        ]);

        const fmt = (r: any): string => {
            const a = r.data?.address || {};
            const parts = [
                a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road,
                a.suburb || a.neighbourhood,
                a.city || a.town || a.village,
                a.postcode,
                a.country
            ].filter(Boolean);
            return parts.join(', ') || r.data?.display_name || `${lat}, ${lng}`;
        };

        const addr1 = fmt(res18);
        const addr2 = fmt(res16);
        const options = addr1 === addr2 ? [addr1] : [addr1, addr2];

        await db.userSession.update({
            where: { wa_id: from },
            data: { state: JSON.stringify({ returnAction, step: 'pick', geoOptions: options }) }
        });

        if (options.length === 1) {
            await confirmAddress(from, options[0], returnAction);
            return;
        }

        const rows = [
            { id: 'addr_pick_0', title: options[0].substring(0, 24), description: options[0].substring(24, 72) },
            { id: 'addr_pick_1', title: options[1].substring(0, 24), description: options[1].substring(24, 72) },
            { id: 'addr_manual', title: '✍️ None — type manually', description: 'Enter your address as text' }
        ];

        await sendListMessage(from,
            '📍 *Confirm your address:*\n\nPick the best match or type it manually.',
            '📍 Select Address',
            [{ title: 'Address Options', rows }]
        );
    } catch (err: any) {
        console.error(`❌ Geocode error: ${err.message}`);
        await db.userSession.update({
            where: { wa_id: from },
            data: { state: JSON.stringify({ returnAction, step: 'manual' }) }
        });
        await sendTextMessage(from, '✍️ Could not look up that location. Please type your full delivery address:');
    }
};

export const handleAddressActions = async (from: string, input: string, message?: any): Promise<void> => {
    const session = await db.userSession.findUnique({ where: { wa_id: from } });
    const stateRaw = session?.state;
    let statePayload: any = null;
    try { statePayload = stateRaw ? JSON.parse(stateRaw) : null; } catch { statePayload = null; }
    const returnAction: string | null = statePayload?.returnAction ?? null;
    const geoOptions: string[] = statePayload?.geoOptions ?? [];

    // View/manage address
    if (input === 'c_address') {
        const addr = await getCustomerAddress(from);
        if (addr) {
            await sendButtons(from,
                `📍 *My Address*\n\n${addr}`,
                [
                    { id: 'addr_change', title: '✏️ Change Address' },
                    { id: 'c_account', title: '↩️ My Account' }
                ]
            );
        } else {
            await sendButtons(from,
                '📍 *My Address*\n\n_No delivery address saved yet._',
                [
                    { id: 'addr_change', title: '📍 Add Address' },
                    { id: 'c_account', title: '↩️ My Account' }
                ]
            );
        }
        return;
    }

    // Start change flow
    if (input === 'addr_change') {
        await startAddressFlow(from, null);
        return;
    }

    // Start address flow from cart
    if (input === 'cart_addr') {
        await startAddressFlow(from, 'cart_checkout');
        return;
    }

    // Pick geocode option
    if (input.startsWith('addr_pick_')) {
        const idx = parseInt(input.replace('addr_pick_', ''), 10);
        if (!isNaN(idx) && geoOptions[idx]) {
            await confirmAddress(from, geoOptions[idx], returnAction);
        } else {
            await sendTextMessage(from, '⚠️ Option not found. Please type your address:');
        }
        return;
    }

    // Manual entry prompt
    if (input === 'addr_manual') {
        await db.userSession.update({
            where: { wa_id: from },
            data: { state: JSON.stringify({ returnAction, step: 'manual' }) }
        });
        await sendTextMessage(from, '✍️ Type your full delivery address:');
        return;
    }

    // ADDR_FLOW active: location pin
    if (session?.active_prod_id === 'ADDR_FLOW' && message?.type === 'location') {
        const lat = message.location?.latitude;
        const lng = message.location?.longitude;
        if (lat !== undefined && lng !== undefined) {
            await handleLocationPin(from, lat, lng, returnAction);
        } else {
            await sendTextMessage(from, '⚠️ Could not read location. Please type your address instead.');
        }
        return;
    }

    // ADDR_FLOW active: text input
    if (session?.active_prod_id === 'ADDR_FLOW' && input) {
        if (input.trim().length < 5) {
            await sendTextMessage(from, '⚠️ Please enter a full address (at least 5 characters):');
            return;
        }
        await confirmAddress(from, input.trim(), returnAction);
        return;
    }
};
