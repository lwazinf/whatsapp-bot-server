import axios from 'axios';

const WHATSAPP_API_URL = 'https://waba-v2.360dialog.io/v1/messages';
const API_KEY = process.env.WHATSAPP_API_KEY!;

export interface SendMessageParams {
  to: string;
  text: string;
}

export interface SendImageParams {
  to: string;
  imageUrl: string;
  caption?: string;
}

export async function sendTextMessage(params: SendMessageParams): Promise<void> {
  try {
    await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'text',
        text: {
          body: params.text
        }
      },
      {
        headers: {
          'D360-API-KEY': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Message sent to ${params.to}`);
  } catch (error: any) {
    console.error('❌ Error sending message:', error.response?.data || error.message);
    throw error;
  }
}

export async function sendImageMessage(params: SendImageParams): Promise<void> {
  try {
    await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'image',
        image: {
          link: params.imageUrl,
          caption: params.caption || ''
        }
      },
      {
        headers: {
          'D360-API-KEY': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Image sent to ${params.to}`);
  } catch (error: any) {
    console.error('❌ Error sending image:', error.response?.data || error.message);
    throw error;
  }
}

export async function sendButtonMessage(to: string, text: string, buttons: Array<{id: string, title: string}>): Promise<void> {
  try {
    await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text
          },
          action: {
            buttons: buttons.map(btn => ({
              type: 'reply',
              reply: {
                id: btn.id,
                title: btn.title
              }
            }))
          }
        }
      },
      {
        headers: {
          'D360-API-KEY': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Button message sent to ${to}`);
  } catch (error: any) {
    console.error('❌ Error sending button message:', error.response?.data || error.message);
    throw error;
  }
}
