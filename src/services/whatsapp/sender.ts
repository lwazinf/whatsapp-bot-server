import axios from 'axios';

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://waba-v2.360dialog.io/v1';
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;

// Correctly format the URL for the messages endpoint
const TARGET_URL = `${WHATSAPP_API_URL.replace(/\/$/, '')}/messages`;

const api = axios.create({
    headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': WHATSAPP_API_KEY as string
    }
});

const sendMessage = async (payload: any): Promise<boolean> => {
    try {
        console.log('📤 Sending to 360Dialog:', JSON.stringify(payload));
        const response = await api.post(TARGET_URL, {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            ...payload
        });
        return response.status === 200 || response.status === 201;
    } catch (error: any) {
        console.error('❌ WhatsApp Send Error:', error.response?.data || error.message);
        return false;
    }
};

export const sendTextMessage = async (to: string, text: string) => {
    return sendMessage({
        to: to.replace(/\D/g, ''),
        type: "text",
        text: { body: text }
    });
};

export const sendButtons = async (to: string, text: string, buttons: { id: string, title: string }[]) => {
    return sendMessage({
        to: to.replace(/\D/g, ''),
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: text },
            action: {
                buttons: buttons.slice(0, 3).map(b => ({
                    type: "reply",
                    reply: { id: b.id, title: b.title }
                }))
            }
        }
    });
};

export default {
    sendTextMessage,
    sendButtons
};