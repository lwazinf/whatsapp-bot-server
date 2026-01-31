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
 * Send text message
 * Supports old calls: sendTextMessage(to)
 * Supports new calls: sendTextMessage(to, body)
 */
export async function sendTextMessage(
  to: string,
  body: string = "👋 Welcome to Omeru Marketplace!"
) {
  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    };

    const res = await whatsappClient.post("", payload);
    return res.data;
  } catch (err: any) {
    log360Error("sendTextMessage", err);
    throw err;
  }
}

/**
 * Send template message (first contact / outside 24h)
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
 * Compatibility function for handler.ts
 * (buttons are NOT supported by 360dialog anymore,
 * so we gracefully downgrade to text)
 */
export async function sendButtonMessage(
  to: string,
  text: string
) {
  console.warn("⚠️ sendButtonMessage is deprecated, falling back to text");

  return sendTextMessage(to, text);
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
