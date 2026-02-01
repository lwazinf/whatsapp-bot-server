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
 * STEP 1: Can we send "Hi"?
 */
export async function sendTextMessage(to: string, body: string) {
  console.log("📤 STEP 1: Testing single word");
  
  const response = await whatsappClient.post("", {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: "Hi" }
  });
  
  console.log("✅ STEP 1 SUCCESS:", response.data);
  return response.data;
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode = "en"
) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };
  return await whatsappClient.post("", payload);
}
