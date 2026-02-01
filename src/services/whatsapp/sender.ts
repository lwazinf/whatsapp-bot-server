import fetch from 'node-fetch';

const API_URL = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
const ACCESS_TOKEN = process.env.WHATSAPP_API_KEY;

export const sendTextMessage = async (to: string, text: string) => {
  await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    }),
  });
};

export const sendButtons = async (to: string, text: string, buttons: { id: string, title: string }[]) => {
  const buttonPayload = buttons.map(btn => ({
    type: "reply",
    reply: { id: btn.id, title: btn.title }
  }));

  await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: { buttons: buttonPayload }
      }
    }),
  });
};