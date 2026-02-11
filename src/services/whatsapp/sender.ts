import axios, { AxiosError } from 'axios';

// ============ CONFIGURATION ============
const API_URL = process.env.WHATSAPP_API_URL || 'https://waba-v2.360dialog.io';
const API_KEY = process.env.WHATSAPP_API_KEY;

// Log warning if API key is missing on startup
if (!API_KEY) {
    console.error('⚠️ CRITICAL: WHATSAPP_API_KEY environment variable is not set!');
}

// Rate limiting settings
const MESSAGE_DELAY_MS = 150; 
let lastMessageTime = 0;

// Axios instance for 360Dialog
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': API_KEY || ''
    },
    timeout: 30000
});

// ============ CORE SEND FUNCTION ============

/**
 * Internal helper to send payloads to the WhatsApp API
 */
const sendMessage = async (payload: any): Promise<boolean> => {
    try {
        // Enforce a small delay between messages to prevent rate-limiting/out-of-order delivery
        const now = Date.now();
        const timeSinceLastMessage = now - lastMessageTime;
        if (timeSinceLastMessage < MESSAGE_DELAY_MS) {
            await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY_MS - timeSinceLastMessage));
        }
        lastMessageTime = Date.now();

        const response = await api.post('/v1/messages', payload);
        
        if (response.status === 200 || response.status === 201) {
            return true;
        }
        
        console.error(`❌ WhatsApp API returned status ${response.status}`);
        return false;

    } catch (error) {
        const err = error as AxiosError;
        if (err.response) {
            console.error('❌ 360Dialog API Error:', {
                status: err.response.status,
                data: err.response.data,
                recipient: payload.to
            });
        } else {
            console.error('❌ Network Error sending to WhatsApp:', err.message);
        }
        return false;
    }
};

// ============ EXPORTED ACTIONS ============

/**
 * Sends a standard text message
 */
export const sendTextMessage = async (to: string, text: string): Promise<boolean> => {
    return sendMessage({
        recipient_type: 'individual',
        to: formatPhoneNumber(to),
        type: 'text',
        text: { body: text.substring(0, 4000) }
    });
};

/**
 * Sends interactive buttons (max 3)
 */
export const sendButtons = async (
    to: string, 
    bodyText: string, 
    buttons: Array<{ id: string; title: string }>,
    footer?: string
): Promise<boolean> => {
    const payload: any = {
        recipient_type: 'individual',
        to: formatPhoneNumber(to),
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: bodyText },
            action: {
                buttons: buttons.slice(0, 3).map(btn => ({
                    type: 'reply',
                    reply: { id: btn.id, title: btn.title.substring(0, 20) }
                }))
            }
        }
    };

    if (footer) payload.interactive.footer = { text: footer };

    return sendMessage(payload);
};

/**
 * Sends a List menu (dropdown style)
 */
export const sendListMessage = async (
    to: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    title?: string,
    footer?: string
): Promise<boolean> => {
    const payload: any = {
        recipient_type: 'individual',
        to: formatPhoneNumber(to),
        type: 'interactive',
        interactive: {
            type: 'list',
            header: title ? { type: 'text', text: title } : undefined,
            body: { text: bodyText },
            footer: footer ? { text: footer } : undefined,
            action: {
                button: buttonText.substring(0, 20),
                sections: sections.map(sec => ({
                    title: sec.title.substring(0, 24),
                    rows: sec.rows.map(row => ({
                        id: row.id,
                        title: row.title.substring(0, 24),
                        description: row.description?.substring(0, 72)
                    }))
                }))
            }
        }
    };

    return sendMessage(payload);
};

/**
 * Sends an image via URL
 */
export const sendImageMessage = async (to: string, imageUrl: string, caption?: string): Promise<boolean> => {
    return sendMessage({
        recipient_type: 'individual',
        to: formatPhoneNumber(to),
        type: 'image',
        image: {
            link: imageUrl,
            caption: caption
        }
    });
};

/**
 * Marks a message as read (blue ticks)
 */
export const markAsRead = async (messageId: string): Promise<boolean> => {
    try {
        const response = await api.post('/v1/messages', {
            status: 'read',
            message_id: messageId
        });
        return response.status === 200;
    } catch (err) {
        return false;
    }
};

// ============ HELPERS ============

/**
 * Standardizes phone numbers for the API (removes +, spaces, etc)
 */
const formatPhoneNumber = (phone: string): string => {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // 360Dialog expects just the numbers (e.g., 27746854339)
    return cleaned;
};