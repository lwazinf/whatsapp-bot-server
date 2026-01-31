import { sendTextMessage } from "./sender";

interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: {
    body: string;
  };
  button?: {
    text: string;
    payload: string;
  };
}

interface WebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      messages?: WebhookMessage[];
    };
  }>;
}

export async function handleIncomingMessage(body: any): Promise<void> {
  try {
    const entry = body.entry?.[0] as WebhookEntry;
    if (!entry) {
      console.log("⚠️ No entry in webhook");
      return;
    }

    const changes = entry.changes?.[0];
    if (!changes?.value?.messages) {
      console.log("⚠️ No messages in webhook");
      return;
    }

    const message = changes.value.messages[0];
    const from = message.from;
    const messageText = message.text?.body || message.button?.text || "";

    console.log(`📱 Message from ${from}: ${messageText}`);

    await routeMessage(from, messageText);
  } catch (error) {
    console.error("❌ Error handling message:", error);
  }
}

async function routeMessage(from: string, text: string): Promise<void> {
  const lowerText = text.toLowerCase().trim();

  // Welcome message
  if (lowerText === "hi" || lowerText === "hello" || lowerText === "start") {
    await sendWelcomeMessage(from);
    return;
  }

  // Register business
  if (lowerText === "register" || lowerText === "1") {
    await startBusinessRegistration(from);
    return;
  }

  // Browse businesses
  if (lowerText === "browse" || lowerText === "2") {
    await sendTextMessage(
      from,
      "🏪 Browse businesses feature coming soon!\n\nFor now, use \"register\" to add your business."
    );
    return;
  }

  // Default response
  await sendWelcomeMessage(from);
}

async function sendWelcomeMessage(to: string): Promise<void> {
  const welcomeText = `👋 Welcome to Omeru Marketplace!

🏪 Multi-Business Ordering Platform

What would you like to do?

1️⃣ Register Business
2️⃣ Browse Businesses

Reply with 1 or 2`;

  await sendTextMessage(to, welcomeText);
}

async function startBusinessRegistration(to: string): Promise<void> {
  await sendTextMessage(
    to,
    `📝 Business Registration

Let's get your business set up!

First, what is your business name?

(Type your business name and send)`
  );

  // TODO: Store user state in Redis
  // await redis.set(`user:${to}:state`, 'awaiting_business_name');
}
