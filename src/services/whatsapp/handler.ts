import { PrismaClient } from '@prisma/client';
import { sendTextMessage, sendImageMessage } from './sender';

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
    const showManagementMenu = async (phoneNumber: string): Promise<void> => {
      const business = await prisma.business.findUnique({ 
        where: { ownerPhone: phoneNumber },
        include: { _count: { select: { products: true } } }
      });

      if (!business) {
        await sendTextMessage(phoneNumber, "👋 Welcome! Reply *1* to create your store.");
        return;
      }

      const menu = `🏪 *${business.name} Management*\n` +
                   `--------------------------\n` +
                   `1️⃣ Add New Product\n` +
                   `2️⃣ View My Catalog (${business._count.products} items)\n\n` +
                   `Reply with a number:`;
      await sendTextMessage(phoneNumber, menu);
    };

    // --- PRODUCT ADDITION FLOW ---

    if (userState?.state === 'AWAITING_PRODUCT_NAME') {
      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { state: 'AWAITING_PRODUCT_DESC', data: { name: text } }
      });
      await sendTextMessage(from, "📝 Provide a description for the product:");
      return;
    }

    if (userState?.state === 'AWAITING_PRODUCT_DESC') {
      const data = userState.data as any;
      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { state: 'AWAITING_PRODUCT_PRICE', data: { ...data, desc: text } }
      });
      await sendTextMessage(from, "💰 Enter the price in Rands (e.g., 150):");
      return;
    }

    if (userState?.state === 'AWAITING_PRODUCT_PRICE') {
      const price = parseFloat(text.replace(/[^0-9.]/g, ''));
      if (isNaN(price)) {
        await sendTextMessage(from, "❌ Invalid price. Use numbers only:");
        return;
      }
      
      const data = userState.data as any;
      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { state: 'AWAITING_PRODUCT_IMAGE', data: { ...data, price } }
      });
      await sendTextMessage(from, "📸 Please upload an image of the product:");
      return;
    }

    if (userState?.state === 'AWAITING_PRODUCT_IMAGE') {
      if (!imageId) {
        await sendTextMessage(from, "❌ Please upload an image to continue:");
        return;
      }
      
      const data = userState.data as any;
      const previewCaption = `👀 *BUYER PREVIEW*\n\n*${data.name}*\n${data.desc}\n\nPrice: *R${data.price}*`;
      
      await sendImageMessage(from, imageId, previewCaption);

      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { state: 'CONFIRMING_PRODUCT', data: { ...data, imageHandle: imageId } }
      });
      await sendTextMessage(from, "Does this look correct?\n\n✅ Reply *YES* to add\n❌ Reply *NO* to cancel");
      return;
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
        await sendTextMessage(from, "✅ Success! Product live.");
      } else {
        await sendTextMessage(from, "❌ Cancelled.");
      }
      
      await prisma.userState.delete({ where: { phoneNumber: from } });
      await showManagementMenu(from);
      return;
    }

    // --- MAIN NAVIGATION ---
    if (text === '1') {
      const business = await prisma.business.findUnique({ where: { ownerPhone: from } });
      if (!business) {
        await prisma.userState.upsert({
          where: { phoneNumber: from },
          update: { state: 'AWAITING_NAME' },
          create: { phoneNumber: from, state: 'AWAITING_NAME' }
        });
        await sendTextMessage(from, "🏪 What is your store name?");
      } else {
        await prisma.userState.update({
          where: { phoneNumber: from },
          data: { state: 'AWAITING_PRODUCT_NAME' }
        });
        await sendTextMessage(from, "🛒 Product name:");
      }
      return;
    }

    if (text === '2') {
      const business = await prisma.business.findUnique({ 
        where: { ownerPhone: from },
        include: { products: true }
      });

      if (!business || business.products.length === 0) {
        await sendTextMessage(from, "Your catalog is empty!");
      } else {
        await sendTextMessage(from, `📦 *${business.name} Catalog*:`);
        for (const product of business.products) {
          const caption = `*${product.name}*\n${product.description}\nPrice: *R${product.price}*`;
          if (product.imageHandle) {
            await sendImageMessage(from, product.imageHandle, caption);
          } else {
            await sendTextMessage(from, caption);
          }
        }
      }
      await showManagementMenu(from);
      return;
    }

    await showManagementMenu(from);

  } catch (error) {
    console.error("Handler Error:", error);
  }
}