import fetch from 'node-fetch';

// Using v2 Cloud API endpoint
const API_URL = 'https://waba-v2.360dialog.io/messages';
const API_KEY = process.env.WHATSAPP_API_KEY;

export const sendTextMessage = async (to: string, text: string) => {
  console.log(`Outgoing attempt to ${to}: ${text}`);

  try {
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
      const errorData = await response.json();
      console.error("❌ 360Dialog Error Details:", JSON.stringify(errorData, null, 2));
    } else {
      console.log("✅ Message sent successfully");
    }
  } catch (err) {
    console.error("❌ Network error sending to 360Dialog:", err);
  }
};

export const sendButtons = async (to: string, text: string, buttons: { id: string, title: string }[]) => {
  const buttonPayload = buttons.map(btn => ({
    type: "reply",
    reply: { id: btn.id, title: btn.title }
  }));

  try {
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
      const errorData = await response.json();
      console.error("❌ 360Dialog Button Error:", JSON.stringify(errorData, null, 2));
    }
  } catch (err) {
    console.error("❌ Network error sending buttons:", err);
  }
};