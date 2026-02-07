import { PrismaClient } from '@prisma/client';
import { sendTextMessage, sendListMessage } from './sender';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

const MAX_LIST_ROWS = 10;

export const handleCustomerDiscovery = async (from: string, input: string): Promise<void> => {
    if (input.startsWith('cat_')) {
        const [, merchantId, categoryId] = input.split('_');
        if (!merchantId) {
            await sendTextMessage(from, '⚠️ Invalid category selection.');
            return;
        }

        const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant) {
            await sendTextMessage(from, '❌ Shop not found.');
            return;
        }

        const filter = categoryId && categoryId !== 'all' ? { category_id: categoryId } : {};
        const products = await db.product.findMany({
            where: {
                merchant_id: merchantId,
                is_in_stock: true,
                status: 'ACTIVE',
                ...filter
            },
            include: { variants: true },
            orderBy: { name: 'asc' },
            take: MAX_LIST_ROWS
        });

        if (products.length === 0) {
            await sendTextMessage(from, '📭 No items found in this category.');
            return;
        }

        const rows = products.map(product => {
            const variantPrices = product.variants.map(v => v.price);
            const displayPrice = variantPrices.length ? Math.min(...variantPrices) : product.price;
            const variantNote = variantPrices.length ? ' • Variants available' : '';
            return {
                id: `prod_${product.id}`,
                title: product.name.substring(0, 24),
                description: `From R${displayPrice.toFixed(2)}${variantNote}`
            };
        });

        await sendListMessage(
            from,
            `📂 *${merchant.trading_name}* ${categoryId === 'all' ? 'Menu' : 'Category'} (${products.length})`,
            '📖 View Items',
            [{ title: 'Items', rows }]
        );
        return;
    }

    if (input.startsWith('prod_')) {
        const productId = input.replace('prod_', '');
        const product = await db.product.findUnique({
            where: { id: productId },
            include: { variants: true, merchant: true }
        });

        if (!product || !product.merchant || product.status !== 'ACTIVE') {
            await sendTextMessage(from, '❌ Item not found.');
            return;
        }

        if (product.variants.length === 0) {
            await sendTextMessage(from, `📦 *${product.name}*\n💰 R${product.price.toFixed(2)}\n\nNo variants available.`);
            return;
        }

        const rows = product.variants.map(variant => ({
            id: `variant_${variant.id}`,
            title: `${variant.size || 'Standard'}${variant.color ? ` • ${variant.color}` : ''}`.substring(0, 24),
            description: `R${variant.price.toFixed(2)}${variant.sku ? ` • ${variant.sku}` : ''}`
        }));

        await sendListMessage(
            from,
            `🎨 *${product.name} Variants* (${product.variants.length})`,
            '🛍️ Choose Variant',
            [{ title: 'Variants', rows }]
        );
        return;
    }

    if (input.startsWith('variant_')) {
        const variantId = input.replace('variant_', '');
        const variant = await db.productVariant.findUnique({
            where: { id: variantId },
            include: { product: { include: { merchant: true } } }
        });

        if (!variant || !variant.product?.merchant) {
            await sendTextMessage(from, '❌ Variant not found.');
            return;
        }

        const details = [
            `📦 ${variant.product.name}`,
            `📐 Size: ${variant.size || 'Standard'}`,
            `🎨 Color: ${variant.color || 'None'}`,
            `🏷️ SKU: ${variant.sku || 'None'}`,
            `💰 R${variant.price.toFixed(2)}`
        ].join('\n');

        await sendTextMessage(from, `🛍️ *Variant Details*\n\n${details}`);
        return;
    }

    // Handle Shop Search via @handle
    if (input.startsWith('@')) {
        const handle = input.replace('@', '').toLowerCase().trim();
        
        if (!handle) {
            await sendTextMessage(from, '⚠️ Please enter a shop handle after @\n\nExample: *@shopname*');
            return;
        }

        const merchant = await db.merchant.findFirst({ 
            where: { handle, status: 'ACTIVE' } 
        });

        if (!merchant) {
            await sendTextMessage(from, `❌ Shop *@${handle}* not found or is currently offline.`);
            return;
        }

        if (merchant.manual_closed) {
            await sendTextMessage(from, `🪪 *${merchant.trading_name}* is currently closed. Please check back later!`);
            return;
        }

        const categories = await db.category.findMany({
            where: { merchant_id: merchant.id },
            orderBy: { name: 'asc' },
            take: MAX_LIST_ROWS - 1
        });

        const welcomeMsg = `👋 Welcome to *${merchant.trading_name}*!\n\n${merchant.description || 'Browse our menu below.'}`;

        if (categories.length > 0) {
            const rows = categories.map(cat => ({
                id: `cat_${merchant.id}_${cat.id}`,
                title: cat.name.substring(0, 24),
                description: cat.description ? cat.description.substring(0, 40) : 'Browse items'
            }));
            rows.unshift({
                id: `cat_${merchant.id}_all`,
                title: 'All Items',
                description: 'Browse full menu'
            });

            await sendListMessage(from, welcomeMsg, '📂 View Categories', [
                { title: 'Categories', rows }
            ]);
            return;
        }

        const products = await db.product.findMany({ 
            where: { 
                merchant_id: merchant.id, 
                is_in_stock: true,
                status: 'ACTIVE'
            },
            include: { variants: true },
            take: MAX_LIST_ROWS,
            orderBy: { name: 'asc' }
        });

        if (products.length > 0) {
            const sections = [{
                title: 'Menu Items',
                rows: products.map(p => {
                    const variantPrices = p.variants.map(v => v.price);
                    const displayPrice = variantPrices.length ? Math.min(...variantPrices) : p.price;
                    const variantNote = variantPrices.length ? ' • Variants available' : '';
                    return {
                        id: `prod_${p.id}`,
                        title: p.name.substring(0, 24),
                        description: `From R${displayPrice.toFixed(2)}${variantNote}`
                    };
                })
            }];

            await sendListMessage(from, welcomeMsg, '📖 View Menu', sections);
        } else {
            await sendTextMessage(from, `📋 *${merchant.trading_name}* hasn't added any products yet.`);
        }
        return;
    }

    // Handle Browse Shops
    if (input === 'browse_shops') {
        const merchants = await db.merchant.findMany({
            where: { status: 'ACTIVE', manual_closed: false },
            take: 10
        });

        if (merchants.length === 0) {
            await sendTextMessage(from, '🔍 No active shops found at the moment.');
            return;
        }

        let msg = '🪪 *Available Shops:*\n\n';
        merchants.forEach(m => {
            msg += `• *@${m.handle}* - ${m.trading_name}\n`;
        });
        msg += '\nType the *@handle* of a shop to view their menu!';
        
        await sendTextMessage(from, msg);
        return;
    }

    await sendTextMessage(from, '🔍 To find a shop, type *@shophandle*');
};
