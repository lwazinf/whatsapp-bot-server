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
    const showManagementMenu = async (phoneNumber: string) => {
      const business = await prisma.business.findUnique({ 
        where: { ownerPhone: phoneNumber },
        include: { _count: { select: { products: true } } }
      });

      if (!business) {
        return await sendTextMessage(phoneNumber, "👋 Welcome! Reply *1* to create your store.");
      }

      const menu = `🏪 *${business.name} Management*\n` +
                   `--------------------------\n` +
                   `1️⃣ Add New Product\n` +
                   `2️⃣ View My Catalog (${business._count.products} items)\n\n` +
                   `Reply with a number:`;
      await sendTextMessage(phoneNumber, menu);
    };

    // --- STATE MACHINE: PRODUCT ADDITION ---

    if (userState?.state === 'AWAITING_PRODUCT_NAME') {
      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { state: 'AWAITING_PRODUCT_DESC', data: { name: text } }
      });
      return await sendTextMessage(from, "📝 Provide a description for the product:");
    }

    if (userState?.state === 'AWAITING_PRODUCT_DESC') {
      const data = userState.data as any;
      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { state: 'AWAITING_PRODUCT_PRICE', data: { ...data, desc: text } }
      });
      return await sendTextMessage(from, "💰 Enter the price in Rands (e.g., 150):");
    }

    if (userState?.state === 'AWAITING_PRODUCT_PRICE') {
      const price = parseFloat(text.replace(/[^0-9.]/g, ''));
      if (isNaN(price)) return await sendTextMessage(from, "❌ Invalid price. Use numbers only:");
      
      const data = userState.data as any;
      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { state: 'AWAITING_PRODUCT_IMAGE', data: { ...data, price } }
      });
      return await sendTextMessage(from, "📸 Please upload an image of the product:");
    }

    if (userState?.state === 'AWAITING_PRODUCT_IMAGE') {
      if (!imageId) return await sendTextMessage(from, "❌ Please upload an image to continue:");
      
      const data = userState.data as any;
      
      // Send the "Buyer Preview"
      const previewCaption = `👀 *BUYER PREVIEW*\n\n*${data.name}*\n${data.desc}\n\nPrice: *R${data.price}*`;
      await sendImageMessage(from, imageId, previewCaption);

      await prisma.userState.update({
        where: { phoneNumber: from },
        data: { state: 'CONFIRMING_PRODUCT', data: { ...data, imageHandle: imageId } }
      });
      return await sendTextMessage(from, "Does this look correct?\n\n✅ Reply *YES* to add\n❌ Reply *NO* to cancel");
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
        await sendTextMessage(from, "✅ Success! Product is now in your catalog.");
      } else {
        await sendTextMessage(from, "❌ Cancelled. Taking you back to the menu.");
      }
      await prisma.userState.delete({ where: { phoneNumber: from } });
      return showManagementMenu(from);
    }

    // --- MAIN NAVIGATION ---

    if (text === '1') { // ADD PRODUCT
      const business = await prisma.business.findUnique({ where: { ownerPhone: from } });
      if (!business) {
        await prisma.userState.upsert({
          where: { phoneNumber: from },
          update: { state: 'AWAITING_NAME' },
          create: { phoneNumber: from, state: 'AWAITING_NAME' }
        });
        return await sendTextMessage(from, "🏪 What is your store name?");
      }
      await prisma.userState.update({ where: { phoneNumber: from }, data: { state: 'AWAITING_PRODUCT_NAME' } });
      return await sendTextMessage(from, "🛒 Product name:");
    }

    if (text === '2') { // VIEW CATALOG
      const business = await prisma.business.findUnique({ 
        where: { ownerPhone: from },
        include: { products: true }
      });

      if (!business || business.products.length === 0) {
        await sendTextMessage(from, "Your catalog is empty! Add products by replying with *1*.");
        return showManagementMenu(from);
      }

      await sendTextMessage(from, `📦 *${business.name} Catalog* (${business.products.length} items):`);
      
      // Loop through products and send previews
      for (const product of business.products) {
        const caption = `*${product.name}*\n${product.description}\nPrice: *R${product.price}*`;
        if (product.imageHandle) {
          await sendImageMessage(from, product.imageHandle, caption);
        } else {
          await sendTextMessage(from, caption);
        }
      }
      return showManagementMenu(from);
    }

    return showManagementMenu(from);

  } catch (error) {
    console.error("Handler Error:", error);
  }
}