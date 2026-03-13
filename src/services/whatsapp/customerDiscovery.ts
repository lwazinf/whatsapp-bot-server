import { sendTextMessage, sendListMessage, sendImageMessage, sendButtons } from './sender';
import { formatCurrency, buildMerchantWelcome } from './messageTemplates';
import { getPlatformBranding } from './platformBranding';
import { setCustomerLastMerchant, upsertMerchantCustomer } from './merchantCustomers';
import { db } from '../../lib/db';

const PAGE_SIZE = 8;

export const handleCustomerDiscovery = async (from: string, input: string): Promise<void> => {
    const platformBranding = await getPlatformBranding(db);

    // ── Category product list ─────────────────────────────────────────────
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

        await upsertMerchantCustomer(merchant.id, from);
        await setCustomerLastMerchant(from, merchant.id);

        const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: merchant.id } });
        const filter = categoryId && categoryId !== 'all' ? { category_id: categoryId } : {};
        const products = await db.product.findMany({
            where: { merchant_id: merchantId, is_in_stock: true, status: 'ACTIVE', ...filter },
            include: { variants: true },
            orderBy: { name: 'asc' },
            take: PAGE_SIZE
        });

        if (products.length === 0) {
            await sendTextMessage(from, '📭 No items found in this category.');
            return;
        }

        const rows = products.map((product: any) => {
            const variantPrices = product.variants.map((v: any) => v.price);
            const displayPrice = variantPrices.length ? Math.min(...variantPrices) : product.price;
            const variantNote = variantPrices.length ? ' • Variants ▸' : '';
            return {
                id: `prod_${product.id}`,
                title: product.name.substring(0, 24),
                description: `${formatCurrency(displayPrice, { merchant, merchantBranding, platform: platformBranding })}${variantNote}`
            };
        });

        await sendListMessage(
            from,
            `📂 *${merchant.trading_name}* (${products.length} items)`,
            '📖 View Items',
            [{ title: 'Items', rows }]
        );
        return;
    }

    // ── Product detail ────────────────────────────────────────────────────
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

        await upsertMerchantCustomer(product.merchant.id, from);
        await setCustomerLastMerchant(from, product.merchant.id);
        const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: product.merchant.id } });

        // Send product image if available
        if (product.image_url) {
            await sendImageMessage(from, product.image_url, product.name);
        }

        if (product.variants.length === 0) {
            const body = [
                `📦 *${product.name}*`,
                product.description ? `\n${product.description}` : '',
                `\n💰 ${formatCurrency(product.price, { merchant: product.merchant, merchantBranding, platform: platformBranding })}`,
                '\n_Contact the shop to order._'
            ].filter(Boolean).join('');
            await sendTextMessage(from, body);
            return;
        }

        const rows = product.variants.map((variant: any) => ({
            id: `variant_${variant.id}`,
            title: `${variant.size || 'Standard'}${variant.color ? ` • ${variant.color}` : ''}`.substring(0, 24),
            description: `${formatCurrency(variant.price, { merchant: product.merchant, merchantBranding, platform: platformBranding })}${variant.sku ? ` • ${variant.sku}` : ''}`
        }));

        const headerText = [
            `🛍️ *${product.name}*`,
            product.description ? product.description.substring(0, 100) : '',
            `Choose a variant to order:`
        ].filter(Boolean).join('\n');

        await sendListMessage(from, headerText, '🛍️ Choose Variant', [{ title: 'Variants', rows }]);
        return;
    }

    // ── Variant detail ────────────────────────────────────────────────────
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

        await upsertMerchantCustomer(variant.product.merchant.id, from);
        await setCustomerLastMerchant(from, variant.product.merchant.id);
        const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: variant.product.merchant.id } });

        // Send product image for the variant if available
        if (variant.product.image_url) {
            await sendImageMessage(from, variant.product.image_url, variant.product.name);
        }

        const parts = [
            `🛍️ *${variant.product.name}*`,
            variant.size ? `📐 Size: ${variant.size}` : '',
            variant.color ? `🎨 Colour: ${variant.color}` : '',
            variant.sku ? `🏷️ SKU: ${variant.sku}` : '',
            `💰 ${formatCurrency(variant.price, { merchant: variant.product.merchant, merchantBranding, platform: platformBranding })}`,
            '\n_Contact the shop or continue checkout to order._'
        ].filter(Boolean).join('\n');

        await sendTextMessage(from, parts);
        return;
    }

    // ── Shop via @handle ──────────────────────────────────────────────────
    if (input.startsWith('@')) {
        const handle = input.replace('@', '').toLowerCase().trim();

        if (!handle) {
            await sendTextMessage(from, '⚠️ Please enter a shop handle after @\n\nExample: *@shopname*');
            return;
        }

        const merchant = await db.merchant.findFirst({ where: { handle, status: 'ACTIVE' } });

        if (!merchant) {
            await sendTextMessage(from, `❌ Shop *@${handle}* not found or is currently offline.`);
            return;
        }

        if (merchant.manual_closed) {
            await sendTextMessage(from, `🪪 *${merchant.trading_name}* is currently closed. Please check back later!`);
            return;
        }

        await upsertMerchantCustomer(merchant.id, from);
        await setCustomerLastMerchant(from, merchant.id);

        const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: merchant.id } });

        const categories = await db.category.findMany({
            where: { merchant_id: merchant.id },
            orderBy: { name: 'asc' },
            take: PAGE_SIZE
        });

        const welcomeMsg = buildMerchantWelcome(merchant, platformBranding);

        // Hero image: welcome_image_url first, then logo, then merchant image
        const heroImage = (merchant as any).welcome_image_url || merchantBranding?.logo_url || merchant.image_url;
        if (heroImage) {
            await sendImageMessage(from, heroImage, merchant.trading_name);
        }

        if (categories.length > 0) {
            const rows = categories.map((cat: any) => ({
                id: `cat_${merchant.id}_${cat.id}`,
                title: cat.name.substring(0, 24),
                description: cat.description ? cat.description.substring(0, 40) : 'Browse items'
            }));
            rows.unshift({ id: `cat_${merchant.id}_all`, title: 'All Items', description: 'Browse full menu' });

            await sendListMessage(from, welcomeMsg, '📂 View Categories', [{ title: 'Categories', rows }]);
            return;
        }

        const products = await db.product.findMany({
            where: { merchant_id: merchant.id, is_in_stock: true, status: 'ACTIVE' },
            include: { variants: true },
            take: PAGE_SIZE,
            orderBy: { name: 'asc' }
        });

        if (products.length > 0) {
            const rows = products.map((p: any) => {
                const variantPrices = p.variants.map((v: any) => v.price);
                const displayPrice = variantPrices.length ? Math.min(...variantPrices) : p.price;
                const variantNote = variantPrices.length ? ' • Variants ▸' : '';
                return {
                    id: `prod_${p.id}`,
                    title: p.name.substring(0, 24),
                    description: `${formatCurrency(displayPrice, { merchant, merchantBranding, platform: platformBranding })}${variantNote}`
                };
            });
            await sendListMessage(from, welcomeMsg, '📖 View Menu', [{ title: 'Menu Items', rows }]);
        } else {
            await sendTextMessage(from, `📋 *${merchant.trading_name}* hasn't added any products yet.`);
        }
        return;
    }

    // ── Browse shops (paginated) ──────────────────────────────────────────
    if (input === 'browse_shops' || input.startsWith('browse_shops_p')) {
        const page = input === 'browse_shops' ? 1 : parseInt(input.replace('browse_shops_p', ''), 10) || 1;
        const skip = (page - 1) * PAGE_SIZE;

        const [merchants, total] = await Promise.all([
            db.merchant.findMany({
                where: { status: 'ACTIVE', manual_closed: false, show_in_browse: true } as any,
                orderBy: { trading_name: 'asc' },
                take: PAGE_SIZE,
                skip
            }),
            db.merchant.count({
                where: { status: 'ACTIVE', manual_closed: false, show_in_browse: true } as any
            })
        ]);

        if (total === 0) {
            await sendTextMessage(from, '🔍 No active shops found at the moment.');
            return;
        }

        const totalPages = Math.ceil(total / PAGE_SIZE);

        let msg = `🪪 *Available Shops* (Page ${page}/${totalPages}):\n\n`;
        merchants.forEach((m: any) => {
            msg += `• *@${m.handle}* — ${m.trading_name}\n`;
        });
        msg += '\nType the *@handle* to open a shop.';

        await sendTextMessage(from, msg);

        // Pagination buttons
        const navBtns: Array<{ id: string; title: string }> = [];
        if (page > 1) navBtns.push({ id: `browse_shops_p${page - 1}`, title: `◀ Prev (${page - 1}|${totalPages})` });
        if (page < totalPages) navBtns.push({ id: `browse_shops_p${page + 1}`, title: `Next (${page + 1}|${totalPages}) ▶` });
        if (navBtns.length > 0) await sendButtons(from, 'Navigate pages:', navBtns);
        return;
    }

    await sendTextMessage(from, '🔍 To find a shop, type *@shophandle*\nOr type *browse_shops* to see all.');
};
