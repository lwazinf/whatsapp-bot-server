export async function sendImageMessage(to: string, mediaId: string, caption: string) {
  const url = `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "image",
        image: { id: mediaId, caption: caption }
      }),
    });
    return await response.json();
  } catch (error) {
    console.error("Error sending image:", error);
  }
}

export async function sendTextMessage(to: string, text: string) {
  const url = `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: text }
      }),
    });
    return await response.json();
  } catch (error) {
    console.error("Error sending text:", error);
  }
}