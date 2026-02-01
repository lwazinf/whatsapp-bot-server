import { sendTextMessage } from "./sender";

export async function handleIncomingMessage(body: any): Promise<void> {
  try {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    const text = message.text?.body?.toLowerCase().trim() || "";

    console.log(`📱 Received from ${from}: ${text}`);

    if (["hi", "hello", "start"].includes(text)) {
      await sendTextMessage(from, "👋 Welcome to Omeru Marketplace!\n\n1️⃣ Register Business\n2️⃣ Browse Businesses\n\nReply with 1 or 2");
    } else if (text === "1" || text === "register") {
      await sendTextMessage(from, "📝 Business Registration\n\nWhat is your business name?");
    } else {
      await sendTextMessage(from, "I'm sorry, I didn't catch that. Type 'hi' to see the main menu.");
    }
  } catch (error) {
    console.error("❌ Handler Error:", error);
  }
}
