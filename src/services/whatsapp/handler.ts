import { PrismaClient } from '@prisma/client';
import { sendTextMessage } from './sender';

const prisma = new PrismaClient();

export async function handleIncomingMessage(body: any): Promise<void> {
  try {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    const text = message.text?.body?.trim() || "";

    // 1. Fetch current user state from Database
    const userState = await prisma.userState.findUnique({ where: { phoneNumber: from } });

    // --- STATE: AWAITING BUSINESS NAME ---
    if (userState?.state === 'AWAITING_NAME') {
      await prisma.business.create({
        data: { 
          ownerPhone: from, 
          name: text 
        }
      });
      await prisma.userState.delete({ where: { phoneNumber: from } });
      await sendTextMessage(from, `✅ Business "${text}" registered!\n\nReply *2* to add your first product.`);
      return;
    }

    // --- STATE: AWAITING PRODUCT NAME ---
    if (userState?.state === 'AWAITING_PRODUCT_NAME') {
      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { 
          state: 'AWAITING_PRODUCT_PRICE',
          data: { productName: text } 
        }
      });
      await sendTextMessage(from, `💰 Price for "${text}":\n(Enter numbers only, e.g., 150)`);
      return;
    }

    // --- STATE: AWAITING PRODUCT PRICE ---
    if (userState?.state === 'AWAITING_PRODUCT_PRICE') {
      const price = parseFloat(text);
      if (isNaN(price)) {
        await sendTextMessage(from, "❌ Invalid price. Please enter a number:");
        return;
      }

      const cachedData = userState.data as any;
      const business = await prisma.business.findUnique({ where: { ownerPhone: from } });

      if (business) {
        await prisma.product.create({
          data: {
            name: cachedData.productName,
            price: price,
            businessId: business.id
          }
        });
        await prisma.userState.delete({ where: { phoneNumber: from } });
        await sendTextMessage(from, `✅ Added: ${cachedData.productName} - R${price}`);
      }
      return;
    }

    // --- MAIN MENU LOGIC ---
    switch (text) {
      case '1': // Register Business
        await prisma.userState.upsert({
          where: { phoneNumber: from },
          update: { state: 'AWAITING_NAME', data: {} },
          create: { phoneNumber: from, state: 'AWAITING_NAME' }
        });
        await sendTextMessage(from, "📝 Business Registration\n\nWhat is your business name?");
        break;

      case '2': // Add Product
        const business = await prisma.business.findUnique({ where: { ownerPhone: from } });
        if (!business) {
          await sendTextMessage(from, "🚫 No business found. Please register your business first by replying *1*.");
        } else {
          await prisma.userState.upsert({
            where: { phoneNumber: from },
            update: { state: 'AWAITING_PRODUCT_NAME', data: {} },
            create: { phoneNumber: from, state: 'AWAITING_PRODUCT_NAME' }
          });
          await sendTextMessage(from, "🛒 Add Product\n\nWhat is the name of the item?");
        }
        break;

      default:
        await sendTextMessage(
          from, 
          "👋 *Welcome to Omeru Marketplace*\n\n1️⃣ Register Business\n2️⃣ Add Product\n3️⃣ View My Catalog\n\nReply with a number to continue."
        );
    }
  } catch (error) {
    console.error("❌ Handler Error:", error);
    // Attempt to notify user of error
    const from = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
    if (from) await sendTextMessage(from, "⚠️ Sorry, something went wrong. Please try again.");
  }
}