const BASE_URL = 'https://waba-v2.360dialog.io/messages';

export async function sendTextMessage(to: string, text: string) {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'D360-API-KEY': process.env.WHATSAPP_API_KEY?.trim() || '',
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
    console.error("❌ Sender Error:", error);
  }
}

export async function sendImageMessage(to: string, mediaId: string, caption: string) {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'D360-API-KEY': process.env.WHATSAPP_API_KEY?.trim() || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "image",
        image: { id: mediaId, caption: caption }
      }),
    });
    return await response.json();
  } catch (error) {
    console.error("❌ Image Sender Error:", error);
  }
}