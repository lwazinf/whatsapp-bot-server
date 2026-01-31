import axios from "axios";

const WHATSAPP_API_URL = "https://waba-v2.360dialog.io/v1/messages";
const API_KEY = process.env.WHATSAPP_API_KEY!;

const whatsappClient = axios.create({
  baseURL: WHATSAPP_API_URL,
  headers: {
    "Content-Type": "application/json",
    "D360-API-KEY": API_KEY,
  },
});

/**
 * ABSOLUTE MINIMUM TEST - Just send "Hi"
 */
export async function sendTextMessage(to: string, body: string) {
  try {
    console.log("📤 Sending to:", to);
    
    const response = await whatsappClient.post("", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: "Hi" }
    });
    
    console.log("✅ Sent:", response.data);
    return response.data;
  } catch (err: any) {
    console.error("❌ Error:", err.response?.data);
    throw err;
  }
}

/**
 * Send template message
 */
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode = "en"
) {
  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    const res = await whatsappClient.post("", payload);
    return res.data;
  } catch (err: any) {
    console.error(`❌ Template error:`, err.response?.data);
    throw err;
  }
}
