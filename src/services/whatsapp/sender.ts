import axios from "axios";

const WHATSAPP_API_URL = "https://waba-v2.360dialog.io/messages";
const API_KEY = process.env.WHATSAPP_API_KEY!;

const whatsappClient = axios.create({
  baseURL: WHATSAPP_API_URL,
  headers: {
    "Content-Type": "application/json",
    "D360-API-KEY": API_KEY,
  },
});

export async function sendTextMessage(to: string, body: string) {
  console.log("📤 Sending WhatsApp message to:", to);
  
  const response = await whatsappClient.post("", {
    messaging_product: "whatsapp", // ✅ Added fix for 400 error
    recipient_type: "individual",
    to,
    type: "text",
    text: { body }
  });
  
  console.log("✅ Success:", response.data);
  return response.data;
}

export async function sendTemplateMessage(to: string, templateName: string, languageCode = "en") {
  return await whatsappClient.post("", {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  });
}
