export async function sendImageMessage(to: string, mediaId: string, caption: string) {
  const url = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY?.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "image",
        image: { id: mediaId, caption: caption }
      }),
    });
    const data = await response.json();
    if (!response.ok) console.error("❌ Meta Image Error:", JSON.stringify(data));
    return data;
  } catch (error) {
    console.error("❌ Network Error (Image):", error);
  }
}

export async function sendTextMessage(to: string, text: string) {
  const url = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY?.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: text }
      }),
    });
    const data = await response.json();
    if (!response.ok) console.error("❌ Meta Text Error:", JSON.stringify(data));
    return data;
  } catch (error) {
    console.error("❌ Network Error (Text):", error);
  }
}