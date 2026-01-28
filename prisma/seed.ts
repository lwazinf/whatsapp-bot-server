import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding multi-business database...');

  // Clear existing data
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.favoriteBusiness.deleteMany({});
  await prisma.operatingHours.deleteMany({});
  await prisma.business.deleteMany({});
  await prisma.user.deleteMany({});
  console.log('✅ Cleared existing data');

  // Create businesses
  const businesses = [
    {
      name: 'Premium Meat Delivery',
      slug: 'premium-meat-delivery',
      description: 'The finest cuts of meat, delivered fresh to your door',
      category: 'meat',
      phone: '27123456789',
      email: 'orders@premiummeat.co.za',
      qrCode: nanoid(12).toUpperCase(),
      minOrderAmount: 50,
      deliveryFee: 30,
      freeDeliveryThreshold: 500,
      isActive: true,
      isVerified: true,
    },
    {
      name: "Joe's Butchery",
      slug: 'joes-butchery',
      description: 'Family-owned butchery serving quality meats since 1985',
      category: 'meat',
      phone: '27198765432',
      email: 'info@joesbutchery.co.za',
      qrCode: nanoid(12).toUpperCase(),
      minOrderAmount: 100,
      deliveryFee: 40,
      freeDeliveryThreshold: 600,
      isActive: true,
      isVerified: true,
    },
    {
      name: 'Fresh Cuts & More',
      slug: 'fresh-cuts-more',
      description: 'Premium meats and artisanal sausages',
      category: 'meat',
      phone: '27112223333',
      email: 'orders@freshcuts.co.za',
      qrCode: nanoid(12).toUpperCase(),
      minOrderAmount: 75,
      deliveryFee: 35,
      freeDeliveryThreshold: 450,
      isActive: true,
      isVerified: true,
    },
  ];

  const createdBusinesses = [];
  for (const biz of businesses) {
    const business = await prisma.business.create({ data: biz });
    createdBusinesses.push(business);
    console.log(`✅ Created business: ${business.name} (QR: ${business.qrCode})`);
  }

  // Create products for each business
  const productsData = [
    // Premium Meat Delivery products
    {
      businessId: createdBusinesses[0].id,
      products: [
        { name: 'Beef Ribeye Steak', category: 'beef', price: 199.99, unit: 'kg', description: 'Premium ribeye' },
        { name: 'Beef Fillet', category: 'beef', price: 249.99, unit: 'kg', description: 'Tender fillet' },
        { name: 'Chicken Breasts', category: 'chicken', price: 89.99, unit: 'kg', description: 'Skinless breasts' },
        { name: 'Pork Chops', category: 'pork', price: 119.99, unit: 'kg', description: 'Thick-cut chops' },
        { name: 'BBQ Pack Family', category: 'bbq', price: 399.99, unit: 'pack', description: 'Mixed meats for 4-6' },
      ],
    },
    // Joe's Butchery products
    {
      businessId: createdBusinesses[1].id,
      products: [
        { name: 'T-Bone Steak', category: 'beef', price: 179.99, unit: 'kg', description: 'Classic T-bone' },
        { name: 'Beef Mince', category: 'beef', price: 89.99, unit: 'kg', description: 'Lean mince' },
        { name: 'Whole Chicken', category: 'chicken', price: 59.99, unit: 'kg', description: 'Fresh whole chicken' },
        { name: 'Pork Ribs', category: 'pork', price: 149.99, unit: 'kg', description: 'Baby back ribs' },
        { name: 'Boerewors', category: 'specials', price: 99.99, unit: 'kg', description: 'Traditional sausage' },
      ],
    },
    // Fresh Cuts & More products
    {
      businessId: createdBusinesses[2].id,
      products: [
        { name: 'Lamb Chops', category: 'lamb', price: 229.99, unit: 'kg', description: 'Premium lamb' },
        { name: 'Chicken Thighs', category: 'chicken', price: 69.99, unit: 'kg', description: 'Bone-in thighs' },
        { name: 'Artisanal Sausages', category: 'specials', price: 129.99, unit: 'kg', description: 'Various flavors' },
        { name: 'Braai Pack Deluxe', category: 'bbq', price: 599.99, unit: 'pack', description: 'Ultimate braai' },
        { name: 'Biltong', category: 'specials', price: 349.99, unit: 'kg', description: 'Dried beef snack' },
      ],
    },
  ];

  for (const bizProducts of productsData) {
    for (const product of bizProducts.products) {
      await prisma.product.create({
        data: {
          ...product,
          businessId: bizProducts.businessId,
          inStock: true,
        },
      });
    }
  }
  console.log('✅ Created products for all businesses');

  // Create operating hours for all businesses (Mon-Sat, 9AM-6PM)
  for (const business of createdBusinesses) {
    for (let day = 1; day <= 6; day++) { // Monday to Saturday
      await prisma.operatingHours.create({
        data: {
          businessId: business.id,
          dayOfWeek: day,
          openTime: '09:00',
          closeTime: '18:00',
          isClosed: false,
        },
      });
    }
    // Sunday closed
    await prisma.operatingHours.create({
      data: {
        businessId: business.id,
        dayOfWeek: 0,
        openTime: '00:00',
        closeTime: '00:00',
        isClosed: true,
      },
    });
  }
  console.log('✅ Created operating hours');

  console.log('\n🎉 Database seeded successfully!');
  console.log(`\n📦 Created:`);
  console.log(`   - ${createdBusinesses.length} businesses`);
  console.log(`   - ${productsData.reduce((sum, b) => sum + b.products.length, 0)} products`);
  console.log(`\n🔑 QR Codes for scanning:`);
  createdBusinesses.forEach((b) => {
    console.log(`   - ${b.name}: ${b.qrCode}`);
  });
}

seed()
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
