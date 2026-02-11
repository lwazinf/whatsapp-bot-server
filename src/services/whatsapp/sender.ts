import axios, { AxiosError } from 'axios';

// 360Dialog On-Premise API Configuration
const API_URL = process.env.WHATSAPP_API_URL || 'https://waba-v2.360dialog.io';
const API_KEY = process.env.WHATSAPP_API_KEY || '';

// Validate on startup
if (!API_KEY) {
    console.error('⚠️ WARNING: WHATSAPP_API_KEY is not set!');
}

// Rate limiting
const MESSAGE_DELAY_MS = 100;
let lastMessageTime = 0;

// Axios instance for 360dialog API
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': API_KEY
    },
    timeout: 30000
});

// ============ CORE SEND FUNCTION ============

const sendMessage = async (payload: any): Promise<boolean> => {
    try {
        // Simple rate limiting
        const now = Date.now();
        const timeSinceLastMessage = now - lastMessageTime;
        if (timeSinceLastMessage < MESSAGE_DELAY_MS) {
            await sleep(MESSAGE_DELAY_MS - timeSinceLastMessage);
        }
        lastMessageTime = Date.now();

        const response = await api.post('/messages', payload);
        
        if (response.status === 200 || response.status === 201) {
            return true;
        }
        
        console.error('❌ WhatsApp API unexpected status:', response.status);
        return false;
        
    } catch (error) {
        handleApiError(error as AxiosError);
        return false;
    }
};

// ============ MESSAGE TYPES ============

/**
 * Send a plain text message
 */
export const sendTextMessage = async (to: string, text: string): Promise<boolean> => {
    const truncatedText = text.length > 4000 ? text.substring(0, 4000) + '...' : text;
    
    const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formatPhoneNumber(to),
        type: 'text',
        text: { 
            preview_url: true,
            body: truncatedText 
        }
    };

    return sendMessage(payload);
};

/**
 * Send interactive buttons (max 3 buttons)
 */
export const sendButtons = async (
    to: string, 
    bodyText: string, 
    buttons: Array<{ id: string; title: string }>
): Promise<boolean> => {
    // WhatsApp limits: max 3 buttons, 20 chars per button title
    const sanitizedButtons = buttons.slice(0, 3).map(btn => ({
        type: 'reply',
        reply: {
            id: btn.id.substring(0, 256),
            title: btn.title.substring(0, 20)
        }
    }));

    if (sanitizedButtons.length === 0) {
        console.warn('⚠️ sendButtons called with no buttons, falling back to text');
        return sendTextMessage(to, bodyText);
    }

    const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formatPhoneNumber(to),
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: bodyText.substring(0, 1024) },
            action: {
                buttons: sanitizedButtons
            }
        }
    };

    return sendMessage(payload);
};

/**
 * Send interactive list message
 */
export const sendListMessage = async (
    to: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string; description?: string }>;
    }>
): Promise<boolean> => {
    // WhatsApp limits: max 10 sections, max 10 rows per section
    const sanitizedSections = sections.slice(0, 10).map(section => ({
        title: section.title.substring(0, 24),
        rows: section.rows.slice(0, 10).map(row => ({
            id: row.id.substring(0, 200),
            title: row.title.substring(0, 24),
            description: row.description?.substring(0, 72)
        }))
    }));

    const totalRows = sanitizedSections.reduce((sum, s) => sum + s.rows.length, 0);
    if (totalRows === 0) {
        console.warn('⚠️ sendListMessage called with no rows, falling back to text');
        return sendTextMessage(to, bodyText);
    }

    const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formatPhoneNumber(to),
        type: 'interactive',
        interactive: {
            type: 'list',
            body: { text: bodyText.substring(0, 1024) },
            action: {
                button: buttonText.substring(0, 20),
                sections: sanitizedSections
            }
        }
    };

    return sendMessage(payload);
};

/**
 * Send an image message with optional caption
 */
export const sendImageMessage = async (
    to: string,
    imageIdOrUrl: string,
    caption?: string
): Promise<boolean> => {
    const isUrl = imageIdOrUrl.startsWith('http://') || imageIdOrUrl.startsWith('https://');
    
    const imagePayload: any = isUrl 
        ? { link: imageIdOrUrl }
        : { id: imageIdOrUrl };
    
    if (caption) {
        imagePayload.caption = caption.substring(0, 1024);
    }

    const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formatPhoneNumber(to),
        type: 'image',
        image: imagePayload
    };

    return sendMessage(payload);
};

/**
 * Mark a message as read (blue ticks)
 */
export const markAsRead = async (messageId: string): Promise<boolean> => {
    const payload = {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
    };

    return sendMessage(payload);
};

// ============ HELPER FUNCTIONS ============

const formatPhoneNumber = (phone: string): string => {
    // Remove all non-numeric except leading +
    let cleaned = phone.replace(/[^\d+]/g, '');
    // Remove leading + if present
    if (cleaned.startsWith('+')) {
        cleaned = cleaned.substring(1);
    }
    return cleaned;
};

const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

const handleApiError = (error: AxiosError): void => {
    if (error.response) {
        console.error('❌ 360Dialog API Error:', {
            status: error.response.status,
            data: JSON.stringify(error.response.data)
        });
        
        const status = error.response.status;
        if (status === 401) {
            console.error('🔐 API Key is invalid! Check WHATSAPP_API_KEY');
        } else if (status === 429) {
            console.error('⏳ Rate limited! Slow down message sending.');
        } else if (status === 400) {
            console.error('📝 Bad request - check message format');
        }
    } else if (error.request) {
        console.error('❌ 360Dialog API No Response:', error.message);
    } else {
        console.error('❌ 360Dialog API Request Error:', error.message);
    }
};
