import { PrismaClient } from '@prisma/client';
import { sendTextMessage } from './sender';

const prisma = new PrismaClient();

export async function handleIncomingMessage(body: any): Promise<void> {
  try {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    const text = message.text?.body?.trim() || "";
    const imageId = message.image?.id;

    const userState = await prisma.userState.findUnique({ where: { phoneNumber: from } });

    // --- HELPER: STORE MANAGEMENT MENU ---
    const showManagementMenu = async (phoneNumber: string) => {
      const business = await prisma.business.findUnique({ 
        where: { ownerPhone: phoneNumber },
        include: { _count: { select: { products: true } } }
      });

      if (!business) {
        return await sendTextMessage(phoneNumber, "👋 Welcome! You don't have a store yet.\n\nReply *1* to create your store on Omeru.");
      }

      // Daily Trends: Count products added today
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const addedToday = await prisma.product.count({
        where: { businessId: business.id, createdAt: { gte: startOfDay } }
      });

      const menu = `🏪 *${business.name} Management*\n` +
                   `--------------------------\n` +
                   `📈 *Today's Trends:*\n` +
                   `• Items Added Today: ${addedToday}\n` +
                   `• Total Items: ${business._count.products}\n\n` +
                   `1️⃣ Add New Product\n` +
                   `2️⃣ View My Catalog\n\n` +
                   `🌐 For advanced analytics, visit: https://omeru.io\n\n` +
                   `Reply with a number:`;
      await sendTextMessage(phoneNumber, menu);
    };

    // --- STATE MACHINE FLOWS ---

    // 1. REGISTRATION FLOW
    if (userState?.state === 'AWAITING_NAME') {
      await prisma.business.create({ data: { ownerPhone: from, name: text } });
      await prisma.userState.delete({ where: { phoneNumber: from } });
      await sendTextMessage(from, `✅ Store "${text}" created! Returning to menu...`);
      return showManagementMenu(from);
    }

    // 2. PRODUCT ADDITION FLOW
    if (userState?.state === 'AWAITING_PRODUCT_NAME') {
      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { state: 'AWAITING_PRODUCT_DESC', data: { name: text } }
      });
      return await sendTextMessage(from, "📝 Provide a short description for this item:");
    }

    if (userState?.state === 'AWAITING_PRODUCT_DESC') {
      const data = userState.data as any;
      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { state: 'AWAITING_PRODUCT_PRICE', data: { ...data, desc: text } }
      });
      return await sendTextMessage(from, "💰 Enter the price in Rands (e.g., 80):");
    }

    if (userState?.state === 'AWAITING_PRODUCT_PRICE') {
      const price = parseFloat(text.replace(/[^0-9.]/g, ''));
      if (isNaN(price)) return await sendTextMessage(from, "❌ Invalid price. Please enter numbers only:");
      
      const data = userState.data as any;
      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { state: 'AWAITING_PRODUCT_IMAGE', data: { ...data, price } }
      });
      return await sendTextMessage(from, "📸 Please upload/send an image of the product:");
    }

    if (userState?.state === 'AWAITING_PRODUCT_IMAGE') {
      if (!imageId) return await sendTextMessage(from, "❌ Please send an image of the product to continue:");
      
      const data = userState.data as any;
      const summary = `📋 *Product Summary*\n` +
                      `• Name: ${data.name}\n` +
                      `• Price: R${data.price}\n` +
                      `• Info: ${data.desc}\n\n` +
                      `Confirm adding this to your store?\n\n` +
                      `✅ Reply *YES*\n` +
                      `❌ Reply *NO* to cancel`;
      
      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { state: 'CONFIRMING_PRODUCT', data: { ...data, imageHandle: imageId } }
      });
      return await sendTextMessage(from, summary);
    }

    if (userState?.state === 'CONFIRMING_PRODUCT') {
      if (text.toUpperCase() === 'YES') {
        const data = userState.data as any;
        const biz = await prisma.business.findUnique({ where: { ownerPhone: from } });
        
        await prisma.product.create({
          data: {
            name: data.name,
            description: data.desc,
            price: data.price,
            imageHandle: data.imageHandle,
            businessId: biz!.id
          }
        });
        await sendTextMessage(from, "✅ Product added to your catalog!");
      } else {
        await sendTextMessage(from, "❌ Product addition cancelled.");
      }
      await prisma.userState.delete({ where: { phoneNumber: from } });
      return showManagementMenu(from);
    }

    // --- DEFAULT NAVIGATION ---
    if (text === '1') {
      const business = await prisma.business.findUnique({ where: { ownerPhone: from } });
      const nextState = business ? 'AWAITING_PRODUCT_NAME' : 'AWAITING_NAME';
      const prompt = business ? "🛒 What is the product name?" : "🏪 What is your store name?";

      await prisma.userState.upsert({
        where: { phoneNumber: from },
        update: { state: nextState, data: {} },
        create: { phoneNumber: from, state: nextState }
      });
      return await sendTextMessage(from, prompt);
    }

    // Default to the Management Menu if they exist, otherwise show intro
    return showManagementMenu(from);

  } catch (error) {
    console.error("Handler Error:", error);
  }
}