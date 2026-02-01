/**
 * 360dialog Sender Service
 * Note: 360dialog handles the Phone ID automatically via your API Key.
 */

const BASE_URL = 'https://waba-v2.360dialog.io/messages';

export async function sendImageMessage(to: string, mediaId: string, caption: string) {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        // ⚠️ CRITICAL: Use D360-API-KEY for 360dialog
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

    const data = await response.json();
    if (!response.ok) {
      console.error("❌ 360dialog Image Error:", JSON.stringify(data));
    } else {
      console.log("✅ Image sent successfully");
    }
    return data;
  } catch (error) {
    console.error("❌ Network Error (Image):", error);
  }
}

export async function sendTextMessage(to: string, text: string) {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        // ⚠️ CRITICAL: Use D360-API-KEY for 360dialog
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

    const data = await response.json();
    if (!response.ok) {
      console.error("❌ 360dialog Text Error:", JSON.stringify(data));
    } else {
      console.log("✅ Text sent successfully");
    }
    return data;
  } catch (error) {
    console.error("❌ Network Error (Text):", error);
  }
}