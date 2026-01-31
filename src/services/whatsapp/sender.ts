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
 * Send text message - MINIMAL working version based on 360Dialog docs
 */
export async function sendTextMessage(to: string, body: string) {
  try {
    // This payload matches EXACTLY what 360Dialog expects
    // axios automatically JSON.stringifies this object
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        body, // This will contain newlines correctly
      },
    };

    console.log("📤 Sending to:", to);
    console.log("📝 Message length:", body.length);

    const res = await whatsappClient.post("", payload);
    console.log(`✅ Message sent successfully`);
    return res.data;
  } catch (err: any) {
    log360Error("sendTextMessage", err);
    throw err;
  }
}

/**
 * Send template message (for first contact / outside 24h window)
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
    log360Error("sendTemplateMessage", err);
    throw err;
  }
}

/**
 * Error logger
 */
function log360Error(context: string, err: any) {
  if (err.response) {
    console.error(`❌ 360dialog ${context} error:`, {
      status: err.response.status,
      data: err.response.data,
    });
  } else {
    console.error(`❌ ${context} error:`, err.message);
  }
}