import { PrismaClient, Mode, MerchantStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const myNumber = "27746854339"; // <-- Change this to your test number

  console.log('🌱 Seeding database...');

  // 1. Create/Update User Session
  await prisma.userSession.upsert({
    where: { wa_id: myNumber },
    update: { 
      mode: Mode.MERCHANT, 
      active_prod_id: null 
    },
    create: {
      wa_id: myNumber,
      mode: Mode.MERCHANT,
    },
  });

  // 2. Create/Update Merchant Profile
  const merchant = await prisma.merchant.upsert({
    where: { wa_id: myNumber },
    update: {
      status: MerchantStatus.ACTIVE,
      trading_name: "Test Store Admin",
    },
    create: {
      wa_id: myNumber,
      trading_name: "Test Store Admin",
      status: MerchantStatus.ACTIVE,
      open_time: "09:00",
      close_time: "17:00",
      sat_open_time: "10:00",
      sat_close_time: "15:00",
      sun_open: false,
    },
  });

  console.log(`✅ Success! Merchant created for: ${merchant.wa_id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });