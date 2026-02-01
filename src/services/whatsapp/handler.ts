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

    if (text.toUpperCase().startsWith('DELETE ')) {
      const productId = text.split(' ')[1];
      const biz = await prisma.business.findUnique({ where: { ownerPhone: from } });
      const product = await prisma.product.findFirst({ where: { id: productId, businessId: biz?.id } });

      if (product) {
        await prisma.product.delete({ where: { id: productId } });
        await sendTextMessage(from, `🗑️ Removed: ${product.name}`);
      } else {
        await sendTextMessage(from, "❌ Product not found.");
      }
      await showManagementMenu(from);
      return;
    }

    if (userState?.state === 'AWAITING_NAME') {
      await prisma.business.create({ data: { ownerPhone: from, name: text } });
      await prisma.userState.delete({ where: { phoneNumber: from } });
      await sendTextMessage(from, `✅ Store "${text}" created!`);
      await showManagementMenu(from);
      return;
    }

    if (userState?.state === 'AWAITING_PRODUCT_NAME') {
      await prisma.userState.update({ where: { phoneNumber: from }, data: { state: 'AWAITING_PRODUCT_DESC', data: { name: text } } });
      await sendTextMessage(from, "📝 Provide a description for the product:");
      return;
    }

    if (userState?.state === 'AWAITING_PRODUCT_DESC') {
      const data = userState.data as any;
      await prisma.userState.update({ where: { phoneNumber: from }, data: { state: 'AWAITING_PRODUCT_PRICE', data: { ...data, desc: text } } });
      await sendTextMessage(from, "💰 Price in Rands (e.g., 150):");
      return;
    }

    if (userState?.state === 'AWAITING_PRODUCT_PRICE') {
      const price = parseFloat(text.replace(/[^0-9.]/g, ''));
      if (isNaN(price)) return await sendTextMessage(from, "❌ Use numbers only:");
      const data = userState.data as any;
      await prisma.userState.update({ where: { phoneNumber: from }, data: { state: 'AWAITING_PRODUCT_IMAGE', data: { ...data, price } } });
      await sendTextMessage(from, "📸 Please upload a product image:");
      return;
    }

    if (userState?.state === 'AWAITING_PRODUCT_IMAGE') {
      if (!imageId) return await sendTextMessage(from, "❌ Please upload an image:");
      const data = userState.data as any;
      await sendImageMessage(from, imageId, `👀 *PREVIEW*\n\n*${data.name}*\n${data.desc}\n\nPrice: *R${data.price}*`);
      await prisma.userState.update({ where: { phoneNumber: from }, data: { state: 'CONFIRMING_PRODUCT', data: { ...data, imageHandle: imageId } } });
      await sendTextMessage(from, "Does this look correct?\n\n✅ Reply *YES*\n❌ Reply *NO*");
      return;
    }

    if (userState?.state === 'CONFIRMING_PRODUCT') {
      if (text.toUpperCase() === 'YES') {
        const data = userState.data as any;
        const biz = await prisma.business.findUnique({ where: { ownerPhone: from } });
        await prisma.product.create({ data: { name: data.name, description: data.desc, price: data.price, imageHandle: data.imageHandle, businessId: biz!.id } });
        await sendTextMessage(from, "✅ Success! Product live.");
      }
      await prisma.userState.delete({ where: { phoneNumber: from } });
      await showManagementMenu(from);
      return;
    }

    if (text === '1') {
      const business = await prisma.business.findUnique({ where: { ownerPhone: from } });
      await prisma.userState.upsert({
        where: { phoneNumber: from },
        update: { state: business ? 'AWAITING_PRODUCT_NAME' : 'AWAITING_NAME', data: {} },
        create: { phoneNumber: from, state: business ? 'AWAITING_PRODUCT_NAME' : 'AWAITING_NAME', data: {} }
      });
      await sendTextMessage(from, business ? "🛒 Product name:" : "🏪 Store name:");
      return;
    }

    if (text === '2') {
      const business = await prisma.business.findUnique({ where: { ownerPhone: from }, include: { products: true } });
      if (!business || business.products.length === 0) {
        await sendTextMessage(from, "Catalog empty!");
      } else {
        for (const product of business.products) {
          const caption = `*${product.name}*\nPrice: *R${product.price}*\n\n🗑️ Reply "DELETE ${product.id}"`;
          product.imageHandle ? await sendImageMessage(from, product.imageHandle, caption) : await sendTextMessage(from, caption);
        }
      }
      await showManagementMenu(from);
      return;
    }

    await showManagementMenu(from);
  } catch (error) {
    console.error("❌ Handler Error:", error);
  }
}