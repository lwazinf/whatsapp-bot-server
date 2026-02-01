import { PrismaClient, Mode, MerchantStatus, OrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const myNumber = "27746854339";

  console.log("🚀 Starting database seed...");

  // 1. Clean up existing data for this specific user to avoid unique constraint errors
  await prisma.order.deleteMany({ where: { merchant: { wa_id: myNumber } } });
  await prisma.product.deleteMany({ where: { merchant: { wa_id: myNumber } } });
  await prisma.userSession.deleteMany({ where: { wa_id: myNumber } });
  await prisma.merchant.deleteMany({ where: { wa_id: myNumber } });

  // 2. Create the Merchant Profile
  const merchant = await prisma.merchant.create({
    data: {
      wa_id: myNumber,
      trading_name: "Omeru Braai Stand",
      legal_entity_name: "Omeru Testing Pty Ltd",
      id_number: "9001015000081",
      status: MerchantStatus.ACTIVE,
      open_time: "08:00",
      close_time: "17:00",
      bank_name: "FNB",
      bank_acc_no: "123456789",
      bank_type: "Savings",
      accepted_terms: true,
    },
  });

  // 3. Set the User Session to Merchant Mode
  await prisma.userSession.create({
    data: {
      wa_id: myNumber,
      mode: Mode.MERCHANT,
    },
  });

  // 4. Create a Pending Order for the "Kitchen View"
  await prisma.order.create({
    data: {
      merchant_id: merchant.id,
      customer_id: "27123456789", // A dummy customer ID
      amount: 85.00,
      status: OrderStatus.PAID,
      items_summary: "1x Braai Mixed Plate (Chops & Wors)",
      is_payout_set: false,
    },
  });

  console.log("✅ Seed complete!");
  console.log(`🏪 Merchant: ${merchant.trading_name}`);
  console.log(`📱 Mode: MERCHANT`);
  console.log(`🍳 Active Orders: 1`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });