import 'dotenv/config';
import axios from 'axios';

(async () => {
    const apiUrl = process.env.WHATSAPP_API_URL!;
    const apiKey = process.env.WHATSAPP_API_KEY!;
    console.log('URL:', apiUrl);
    console.log('KEY:', apiKey?.slice(0, 6) + '...\n');

    const send = async (label: string, payload: any) => {
        const r = await axios.post(`${apiUrl}/messages`, payload, {
            headers: { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' },
            validateStatus: () => true
        });
        console.log(`[${label}] ${r.status}`, JSON.stringify(r.data));
    };

    // Format A: minimal — what the old diag.ts used and got 200
    await send('minimal', { to: '27746854339', type: 'text', text: { body: 'test A' } });

    // Format B: with messaging_product
    await send('+messaging_product', { messaging_product: 'whatsapp', to: '27746854339', type: 'text', text: { body: 'test B' } });

    // Format C: full Cloud API format
    await send('full Cloud API', { messaging_product: 'whatsapp', recipient_type: 'individual', to: '27746854339', type: 'text', text: { body: 'test C' } });
})();
