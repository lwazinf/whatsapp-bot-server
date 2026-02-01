import fetch from 'node-fetch';

// v2 is the modern Cloud API standard for 360Dialog
const API_URL = 'https://waba-v2.360dialog.io/messages';
const API_KEY = process.env.WHATSAPP_API_KEY;

export const sendTextMessage = async (to: string, text: string) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'D360-API-KEY': API_KEY as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text }
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("360Dialog Text Error:", error);
  }
};

export const sendButtons = async (to: string, text: string, buttons: { id: string, title: string }[]) => {
  const buttonPayload = buttons.map(btn => ({
    type: "reply",
    reply: { id: btn.id, title: btn.title }
  }));

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'D360-API-KEY': API_KEY as string,
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

  if (!response.ok) {
    const error = await response.text();
    console.error("360Dialog Button Error:", error);
  }
};