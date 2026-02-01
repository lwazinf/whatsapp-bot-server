import { PrismaClient } from '@prisma/client';
import { sendTextMessage } from './sender';

const prisma = new PrismaClient();

export async function handleIncomingMessage(body: any) {
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return;

  const from = message.from;
  const text = message.text?.body?.trim();

  // 1. Check if user is in a "State" (e.g., currently registering)
  const userState = await prisma.userState.findUnique({ where: { phoneNumber: from } });

  if (userState?.state === 'AWAITING_NAME') {
    // Save the Business Name to the DB
    await prisma.business.create({
      data: { ownerPhone: from, name: text }
    });
    
    // Clear the state so they aren't stuck in registration
    await prisma.userState.delete({ where: { phoneNumber: from } });
    
    return await sendTextMessage(from, `✅ Success! Your business "${text}" has been registered.`);
  }

  // 2. Default Menu Logic
  if (text === '1' || text?.toLowerCase() === 'register') {
    await prisma.userState.upsert({
      where: { phoneNumber: from },
      update: { state: 'AWAITING_NAME' },
      create: { phoneNumber: from, state: 'AWAITING_NAME' }
    });
    return await sendTextMessage(from, "📝 Business Registration: What is your business name?");
  }

  // Default Greeting
  return await sendTextMessage(from, "👋 Welcome! Reply 1 to Register a Business or 2 to Browse.");
}