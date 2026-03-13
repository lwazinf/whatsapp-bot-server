import axios, { AxiosError } from 'axios';

// ============ CONFIGURATION ============
// Read dynamically per request so key changes and cold-start timing are never an issue
const getConfig = () => {
    const apiUrl = process.env.WHATSAPP_API_URL || 'https://waba-v2.360dialog.io';
    const apiKey = process.env.WHATSAPP_API_KEY || '';
    if (!apiKey) console.error('⚠️ CRITICAL: WHATSAPP_API_KEY is not set!');
    return { apiUrl, apiKey };
};

// Rate limiting settings
const MESSAGE_DELAY_MS = 150;
let lastMessageTime = 0;

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

        const { apiUrl, apiKey } = getConfig();
        const response = await axios.post(`${apiUrl}/messages`, payload, {
            headers: { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' }
        });
        
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
        messaging_product: 'whatsapp',
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
        messaging_product: 'whatsapp',
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
        messaging_product: 'whatsapp',
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
 * Sends an interactive message with an image header + reply buttons (max 3).
 * Used for product cards in the customer-facing store view.
 */
export const sendInteractiveImageButtons = async (
    to: string,
    imageUrlOrId: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    footer?: string
): Promise<boolean> => {
    const isUrl = imageUrlOrId.startsWith('http://') || imageUrlOrId.startsWith('https://');
    const imagePayload = isUrl ? { link: imageUrlOrId } : { id: imageUrlOrId };
    const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formatPhoneNumber(to),
        type: 'interactive',
        interactive: {
            type: 'button',
            header: { type: 'image', image: imagePayload },
            body: { text: bodyText.substring(0, 1024) },
            action: {
                buttons: buttons.slice(0, 3).map(btn => ({
                    type: 'reply',
                    reply: { id: btn.id, title: btn.title.substring(0, 20) }
                }))
            }
        }
    };
    if (footer) payload.interactive.footer = { text: footer.substring(0, 60) };
    return sendMessage(payload);
};

/**
 * Sends an image — auto-detects URL vs 360Dialog media ID.
 * Images uploaded through the bot are stored as media IDs (not URLs).
 * Images on R2/CDN are full https:// URLs.
 */
export const sendImageMessage = async (to: string, imageUrlOrId: string, caption?: string): Promise<boolean> => {
    const isUrl = imageUrlOrId.startsWith('http://') || imageUrlOrId.startsWith('https://');
    const imagePayload = isUrl
        ? { link: imageUrlOrId, ...(caption ? { caption } : {}) }
        : { id: imageUrlOrId, ...(caption ? { caption } : {}) };
    return sendMessage({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formatPhoneNumber(to),
        type: 'image',
        image: imagePayload
    });
};

/**
 * Marks a message as read (blue ticks)
 */
export const markAsRead = async (messageId: string): Promise<boolean> => {
    try {
        const { apiUrl, apiKey } = getConfig();
        const response = await axios.post(`${apiUrl}/messages`, {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId
        }, {
            headers: { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' }
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