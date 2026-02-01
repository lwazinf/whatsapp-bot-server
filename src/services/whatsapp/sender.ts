// services/whatsapp/sender.ts
import fetch from 'node-fetch';

const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const API_KEY = process.env.WHATSAPP_API_KEY?.trim();
const BASE_URL = `https://waba-v2.360dialog.io/messages`; 

/**
 * Sends a standard text message
 */
export async function sendTextMessage(to: string, text: string) {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'D360-API-KEY': API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: { body: text }
      }),
    });
    return await response.json();
  } catch (error) {
    console.error("❌ sendTextMessage Error:", error);
  }
}

/**
 * Sends interactive reply buttons (Max 3 buttons)
 */
export async function sendButtons(to: string, text: string, buttons: { id: string, title: string }[]) {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'D360-API-KEY': API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: text },
          action: {
            buttons: buttons.map(btn => ({
              type: "reply",
              reply: { id: btn.id, title: btn.title }
            }))
          }
        }
      }),
    });
    return await response.json();
  } catch (error) {
    console.error("❌ sendButtons Error:", error);
  }
}