import { sendTextMessage, sendListMessage, sendImageMessage, sendButtons } from './sender';
import { formatCurrency, buildMerchantWelcome } from './messageTemplates';
import { getPlatformBranding } from './platformBranding';
import { setCustomerLastMerchant, upsertMerchantCustomer } from './merchantCustomers';
import { createPaymentRequest } from '../payments/ozow';
import { db } from '../../lib/db';

const PAGE_SIZE = 8;
const BROWSE_PAGE_SIZE = 5;

// ── Cart helpers ──────────────────────────────────────────────────────────────

type CartItem = {
    product_id: string;
    product_name: string;
    price: number;
    qty: number;
    variant_id?: string;
    variant_label?: string;
};

type Cart = {
    merchant_id: string;
    merchant_name: string;
    merchant_handle: string;
    items: CartItem[];
};

const getCart = async (waId: string): Promise<Cart | null> => {
    const session = await db.userSession.findUnique({ where: { wa_id: waId }, select: { cart_json: true } });
    if (!session?.cart_json) return null;
    try { return JSON.parse(session.cart_json) as Cart; } catch { return null; }
};

const saveCart = async (waId: string, cart: Cart | null): Promise<void> => {
    await db.userSession.update({
        where: { wa_id: waId },
        data: { cart_json: cart ? JSON.stringify(cart) : null }
    });
};

const cartTotal = (cart: Cart): number =>
    cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);

// ── Wishlist helpers ──────────────────────────────────────────────────────────

const isWishlisted = async (waId: string, productId: string): Promise<boolean> => {
    const entry = await db.wishlist.findUnique({
        where: { wa_id_product_id: { wa_id: waId, product_id: productId } }
    });
    return !!entry;
};

const toggleWishlist = async (waId: string, productId: string): Promise<boolean> => {
    const existing = await db.wishlist.findUnique({
        where: { wa_id_product_id: { wa_id: waId, product_id: productId } }
    });
    if (existing) {
        await db.wishlist.delete({ where: { wa_id_product_id: { wa_id: waId, product_id: productId } } });
        return false;
    }
    await db.wishlist.create({ data: { wa_id: waId, product_id: productId } });
    return true;
};

// ── Cart display ──────────────────────────────────────────────────────────────

const sendCartView = async (from: string, cart: Cart, platformBranding: any): Promise<void> => {
    const merchant = await db.merchant.findUnique({ where: { id: cart.merchant_id } });
    const merchantBranding = merchant
        ? await db.merchantBranding.findUnique({ where: { merchant_id: merchant.id } })
        : null;

    let msg = `🛒 *Your Cart*  —  ${cart.merchant_name}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    cart.items.forEach((item, i) => {
        const label = item.variant_label ? ` (${item.variant_label})` : '';
        const lineTotal = formatCurrency(item.price * item.qty, { merchant, merchantBranding, platform: platformBranding });
        msg += `${i + 1}. ${item.qty}x ${item.product_name}${label}  —  ${lineTotal}\n`;
    });
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 *Total: ${formatCurrency(cartTotal(cart), { merchant, merchantBranding, platform: platformBranding })}*`;

    await sendButtons(from, msg, [
        { id: 'cart_checkout', title: '✅ Checkout' },
        { id: `@${cart.merchant_handle}`, title: '➕ Add More' },
        { id: 'cart_clear', title: '🗑️ Clear Cart' }
    ]);
};

// ── Main handler ──────────────────────────────────────────────────────────────

export const handleCustomerDiscovery = async (from: string, input: string): Promise<void> => {
    const platformBranding = await getPlatformBranding(db);

    // ── View cart ─────────────────────────────────────────────────────────────
    if (input === 'c_cart') {
        const cart = await getCart(from);
        if (!cart || cart.items.length === 0) {
            await sendButtons(from, '🛒 Your cart is empty.', [
                { id: 'browse_shops', title: '🛍️ Browse Shops' },
                { id: 'c_home', title: '🏠 Home' }
            ]);
            return;
        }
        await sendCartView(from, cart, platformBranding);
        return;
    }

    // ── Clear cart ────────────────────────────────────────────────────────────
    if (input === 'cart_clear') {
        await saveCart(from, null);
        await sendButtons(from, '🗑️ Cart cleared.', [
            { id: 'browse_shops', title: '🛍️ Browse Shops' },
            { id: 'c_home', title: '🏠 Home' }
        ]);
        return;
    }

    // ── Checkout ──────────────────────────────────────────────────────────────
    if (input === 'cart_checkout') {
        const cart = await getCart(from);
        if (!cart || cart.items.length === 0) {
            await sendTextMessage(from, '⚠️ Your cart is empty.');
            return;
        }

        const merchant = await db.merchant.findUnique({ where: { id: cart.merchant_id } });
        const merchantBranding = merchant
            ? await db.merchantBranding.findUnique({ where: { merchant_id: merchant.id } })
            : null;

        if (!merchant || merchant.status !== 'ACTIVE') {
            await sendTextMessage(from, '❌ This shop is no longer available.');
            await saveCart(from, null);
            return;
        }

        const total = cartTotal(cart);
        let summary = `🛒 *Order Summary*\n\n`;
        summary += `🏪 ${merchant.trading_name}\n`;
        summary += `━━━━━━━━━━━━━━━━━━━━\n`;
        cart.items.forEach(item => {
            const label = item.variant_label ? ` (${item.variant_label})` : '';
            summary += `• ${item.qty}x ${item.product_name}${label}  —  ${formatCurrency(item.price * item.qty, { merchant, merchantBranding, platform: platformBranding })}\n`;
        });
        summary += `━━━━━━━━━━━━━━━━━━━━\n`;
        summary += `💰 *Total: ${formatCurrency(total, { merchant, merchantBranding, platform: platformBranding })}*`;

        await sendButtons(from, summary, [
            { id: 'cart_confirm_order', title: '✅ Confirm Order' },
            { id: 'c_cart', title: '✏️ Edit Cart' }
        ]);
        return;
    }

    // ── Confirm & place order ─────────────────────────────────────────────────
    if (input === 'cart_confirm_order') {
        const cart = await getCart(from);
        if (!cart || cart.items.length === 0) {
            await sendTextMessage(from, '⚠️ Your cart is empty.');
            return;
        }

        const merchant = await db.merchant.findUnique({ where: { id: cart.merchant_id } });
        const merchantBranding = merchant
            ? await db.merchantBranding.findUnique({ where: { merchant_id: merchant.id } })
            : null;

        if (!merchant) {
            await sendTextMessage(from, '❌ Shop not found.');
            return;
        }

        const total = cartTotal(cart);
        const itemsSummary = cart.items
            .map(i => `${i.qty}x ${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ''}`)
            .join(', ');

        const order = await db.order.create({
            data: {
                customer_id: from,
                merchant_id: merchant.id,
                total,
                items_summary: itemsSummary,
                status: 'PENDING',
                order_items: {
                    create: cart.items.map(item => ({
                        product_id: item.product_id,
                        quantity: item.qty,
                        price: item.price
                    }))
                }
            }
        });

        // Clear cart after order is created
        await saveCart(from, null);

        // Notify merchant of new order
        const notif = [
            `🛒 *New Order! #${order.id.slice(-5)}*`,
            `👤 Customer: ${from}`,
            `━━━━━━━━━━━━━━━━━━━━`,
            itemsSummary,
            `━━━━━━━━━━━━━━━━━━━━`,
            `💰 Total: ${formatCurrency(total, { merchant, merchantBranding, platform: platformBranding })}`
        ].join('\n');
        await sendTextMessage(merchant.wa_id, notif);

        // ── OZOW PAYMENT ──────────────────────────────────────────────────────
        try {
            const { paymentUrl, transactionRef } = await createPaymentRequest({
                orderId:      order.id,
                amount:       total,
                merchantName: merchant.trading_name
            });

            await db.order.update({
                where: { id: order.id },
                data:  { payment_ref: transactionRef, payment_url: paymentUrl }
            });

            const payMsg = [
                `✅ *Order #${order.id.slice(-5)} confirmed!*`,
                ``,
                `🏪 ${merchant.trading_name}`,
                `💰 ${formatCurrency(total, { merchant, merchantBranding, platform: platformBranding })}`,
                ``,
                `💳 *Complete your payment:*`,
                paymentUrl
            ].join('\n');

            await sendButtons(from, payMsg, [
                { id: `retry_payment_${order.id}`, title: '🔄 Resend Link' },
                { id: 'c_my_orders', title: '📦 My Orders' }
            ]);
        } catch (payErr: any) {
            console.error(`❌ Ozow payment request failed: ${payErr.message}`);
            // Order exists but payment link generation failed — customer informed
            const fallbackMsg = [
                `✅ *Order #${order.id.slice(-5)} placed!*`,
                ``,
                `🏪 ${merchant.trading_name}`,
                `💰 ${formatCurrency(total, { merchant, merchantBranding, platform: platformBranding })}`,
                ``,
                `⚠️ _Payment link could not be generated. The shop owner will contact you to arrange payment._`
            ].join('\n');
            await sendButtons(from, fallbackMsg, [
                { id: 'c_my_orders', title: '📦 My Orders' },
                { id: 'browse_shops', title: '🛍️ Browse More' }
            ]);
        }
        // ── END OZOW ──────────────────────────────────────────────────────────
        return;
    }

    // ── Wishlist toggle ───────────────────────────────────────────────────────
    if (input.startsWith('wish_prod_')) {
        const productId = input.replace('wish_prod_', '');
        const product = await db.product.findUnique({
            where: { id: productId },
            include: { merchant: true }
        });
        if (!product || !product.merchant) {
            await sendTextMessage(from, '❌ Item not found.');
            return;
        }

        const added = await toggleWishlist(from, productId);
        const wishBtn = added
            ? { id: `wish_prod_${productId}`, title: '💔 Remove Wishlist' }
            : { id: `wish_prod_${productId}`, title: '❤️ Wishlist' };

        await sendButtons(
            from,
            added ? `❤️ *${product.name}* saved to your Wishlist!` : `💔 *${product.name}* removed from Wishlist.`,
            [
                wishBtn,
                { id: `prod_${productId}`, title: '↩️ Back to Item' },
                { id: `@${product.merchant.handle}`, title: '🏪 Shop' }
            ]
        );
        return;
    }

    // ── View wishlist ─────────────────────────────────────────────────────────
    if (input === 'c_wishlist') {
        const entries = await db.wishlist.findMany({
            where: { wa_id: from },
            include: { product: { include: { merchant: true } } },
            orderBy: { createdAt: 'desc' },
            take: PAGE_SIZE
        });

        if (entries.length === 0) {
            await sendButtons(from, '❤️ Your Wishlist is empty.\n\nBrowse shops and save items you love!', [
                { id: 'browse_shops', title: '🛍️ Browse Shops' },
                { id: 'c_account', title: '↩️ My Account' }
            ]);
            return;
        }

        const rows = entries.map((e: any) => ({
            id: `prod_${e.product.id}`,
            title: e.product.name.substring(0, 24),
            description: `${e.product.merchant?.trading_name || 'Shop'}`
        }));

        await sendListMessage(from, `❤️ *Your Wishlist* (${entries.length} item${entries.length !== 1 ? 's' : ''})`, '👀 View Item', [
            { title: 'Saved Items', rows }
        ]);
        return;
    }

    // ── Add product to cart ───────────────────────────────────────────────────
    if (input.startsWith('add_cart_prod_')) {
        const productId = input.replace('add_cart_prod_', '');
        const product = await db.product.findUnique({
            where: { id: productId },
            include: { merchant: true }
        });
        if (!product || !product.merchant || product.status !== 'ACTIVE' || !product.is_in_stock) {
            await sendTextMessage(from, '❌ Item is no longer available.');
            return;
        }

        const existing = await getCart(from);
        if (existing && existing.merchant_id !== product.merchant.id) {
            await sendButtons(from,
                `⚠️ Your cart has items from *${existing.merchant_name}*.\n\nStart a new cart for *${product.merchant.trading_name}*?`,
                [
                    { id: `replace_cart_prod_${productId}`, title: '🆕 New Cart' },
                    { id: 'c_cart', title: '🛒 Keep Current' }
                ]
            );
            return;
        }

        const cart: Cart = existing || {
            merchant_id: product.merchant.id,
            merchant_name: product.merchant.trading_name,
            merchant_handle: product.merchant.handle,
            items: []
        };

        const idx = cart.items.findIndex(i => i.product_id === productId && !i.variant_id);
        if (idx >= 0) {
            cart.items[idx].qty += 1;
        } else {
            cart.items.push({ product_id: productId, product_name: product.name, price: product.price, qty: 1 });
        }
        await saveCart(from, cart);

        const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: product.merchant.id } });
        await sendButtons(from,
            `✅ *${product.name}* added to cart!\n🛒 ${cart.items.reduce((s, i) => s + i.qty, 0)} item(s)  —  ${formatCurrency(cartTotal(cart), { merchant: product.merchant, merchantBranding, platform: platformBranding })}`,
            [
                { id: 'c_cart', title: '🛒 View Cart' },
                { id: `@${product.merchant.handle}`, title: '➕ Add More' },
                { id: 'cart_checkout', title: '✅ Checkout' }
            ]
        );
        return;
    }

    // ── Add variant to cart ───────────────────────────────────────────────────
    if (input.startsWith('add_cart_variant_')) {
        const variantId = input.replace('add_cart_variant_', '');
        const variant = await db.productVariant.findUnique({
            where: { id: variantId },
            include: { product: { include: { merchant: true } } }
        });
        if (!variant || !variant.product?.merchant || !variant.is_in_stock) {
            await sendTextMessage(from, '❌ Item is no longer available.');
            return;
        }

        const merchant = variant.product.merchant;
        const existing = await getCart(from);
        if (existing && existing.merchant_id !== merchant.id) {
            await sendButtons(from,
                `⚠️ Your cart has items from *${existing.merchant_name}*.\n\nStart a new cart for *${merchant.trading_name}*?`,
                [
                    { id: `replace_cart_variant_${variantId}`, title: '🆕 New Cart' },
                    { id: 'c_cart', title: '🛒 Keep Current' }
                ]
            );
            return;
        }

        const variantLabel = [variant.size, variant.color].filter(Boolean).join(' • ');
        const cart: Cart = existing || {
            merchant_id: merchant.id,
            merchant_name: merchant.trading_name,
            merchant_handle: merchant.handle,
            items: []
        };

        const idx = cart.items.findIndex(i => i.variant_id === variantId);
        if (idx >= 0) {
            cart.items[idx].qty += 1;
        } else {
            cart.items.push({
                product_id: variant.product_id,
                product_name: variant.product.name,
                price: variant.price,
                qty: 1,
                variant_id: variantId,
                variant_label: variantLabel || undefined
            });
        }
        await saveCart(from, cart);

        const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: merchant.id } });
        await sendButtons(from,
            `✅ *${variant.product.name}${variantLabel ? ` (${variantLabel})` : ''}* added to cart!\n🛒 ${cart.items.reduce((s, i) => s + i.qty, 0)} item(s)  —  ${formatCurrency(cartTotal(cart), { merchant, merchantBranding, platform: platformBranding })}`,
            [
                { id: 'c_cart', title: '🛒 View Cart' },
                { id: `@${merchant.handle}`, title: '➕ Add More' },
                { id: 'cart_checkout', title: '✅ Checkout' }
            ]
        );
        return;
    }

    // ── Replace cart (cross-merchant) ────────────────────────────────────────
    if (input.startsWith('replace_cart_prod_')) {
        const productId = input.replace('replace_cart_prod_', '');
        await saveCart(from, null);
        await handleCustomerDiscovery(from, `add_cart_prod_${productId}`);
        return;
    }

    if (input.startsWith('replace_cart_variant_')) {
        const variantId = input.replace('replace_cart_variant_', '');
        await saveCart(from, null);
        await handleCustomerDiscovery(from, `add_cart_variant_${variantId}`);
        return;
    }

    // ── Category product list ─────────────────────────────────────────────────
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
            await sendButtons(from, '📭 No items in this category right now.', [
                { id: `cat_${merchantId}_all`, title: '🛒 See All Items' },
                { id: 'c_discover', title: '🏠 Discover' }
            ]);
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
            `🔥 *${merchant.trading_name}* — ${products.length} item${products.length !== 1 ? 's' : ''} available`,
            '📖 View Items',
            [{ title: 'Items', rows }]
        );
        return;
    }

    // ── Product detail ────────────────────────────────────────────────────────
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

        const displayPrice = product.variants.length
            ? Math.min(...product.variants.map((v: any) => v.price))
            : product.price;
        const priceStr = formatCurrency(displayPrice, { merchant: product.merchant, merchantBranding, platform: platformBranding });
        const stockBadge = product.is_in_stock ? '✅ In Stock' : '❌ Out of Stock';

        const caption = [
            `🛍️ *${product.name}*`,
            product.description ? product.description.substring(0, 150) : '',
            `💰 ${priceStr}  •  ${stockBadge}`
        ].filter(Boolean).join('\n');

        if (product.image_url) {
            await sendImageMessage(from, product.image_url, caption);
        } else {
            await sendTextMessage(from, caption);
        }

        if (product.variants.length > 0) {
            // Has variants — show picker first
            const rows = product.variants.map((variant: any) => ({
                id: `variant_${variant.id}`,
                title: `${variant.size || 'Standard'}${variant.color ? ` • ${variant.color}` : ''}`.substring(0, 24),
                description: [
                    formatCurrency(variant.price, { merchant: product.merchant!, merchantBranding, platform: platformBranding }),
                    variant.sku ? variant.sku : '',
                    variant.is_in_stock ? '' : '❌ Out of Stock'
                ].filter(Boolean).join('  •  ')
            }));
            await sendListMessage(from, '👇 Pick your option:', '🛍️ Choose Variant', [{ title: 'Variants', rows }]);
            return;
        }

        // No variants
        const wishlisted = await isWishlisted(from, product.id);
        const wishBtn = wishlisted
            ? { id: `wish_prod_${product.id}`, title: '💔 Remove Wishlist' }
            : { id: `wish_prod_${product.id}`, title: '❤️ Wishlist' };

        if (product.is_in_stock) {
            await sendButtons(from, '⚡ Ready to order?', [
                { id: `add_cart_prod_${product.id}`, title: '🛒 Add to Cart' },
                wishBtn,
                { id: `@${product.merchant.handle}`, title: '↩️ Back to Shop' }
            ]);
        } else {
            await sendButtons(from, '😔 This item is currently out of stock.', [
                wishBtn,
                { id: `@${product.merchant.handle}`, title: '↩️ Back to Shop' }
            ]);
        }
        return;
    }

    // ── Variant detail ────────────────────────────────────────────────────────
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

        const priceStr = formatCurrency(variant.price, { merchant: variant.product.merchant, merchantBranding, platform: platformBranding });
        const stockBadge = variant.is_in_stock ? '✅ In Stock' : '❌ Out of Stock';

        const caption = [
            `🛍️ *${variant.product.name}*`,
            variant.size ? `📐 Size: ${variant.size}` : '',
            variant.color ? `🎨 Colour: ${variant.color}` : '',
            variant.sku ? `🏷️ SKU: ${variant.sku}` : '',
            `💰 ${priceStr}  •  ${stockBadge}`
        ].filter(Boolean).join('\n');

        if (variant.product.image_url) {
            await sendImageMessage(from, variant.product.image_url, caption);
        } else {
            await sendTextMessage(from, caption);
        }

        const wishlisted = await isWishlisted(from, variant.product.id);
        const wishBtn = wishlisted
            ? { id: `wish_prod_${variant.product.id}`, title: '💔 Remove Wishlist' }
            : { id: `wish_prod_${variant.product.id}`, title: '❤️ Wishlist' };

        if (variant.is_in_stock) {
            await sendButtons(from, '⚡ Ready to order?', [
                { id: `add_cart_variant_${variant.id}`, title: '🛒 Add to Cart' },
                wishBtn,
                { id: `@${variant.product.merchant.handle}`, title: '↩️ Back to Shop' }
            ]);
        } else {
            await sendButtons(from, '😔 This variant is out of stock.', [
                wishBtn,
                { id: `@${variant.product.merchant.handle}`, title: '↩️ Back to Shop' }
            ]);
        }
        return;
    }

    // ── Shop via @handle ──────────────────────────────────────────────────────
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

    // ── Browse shops (paginated list) ─────────────────────────────────────────
    if (input === 'browse_shops' || input.startsWith('browse_shops_p')) {
        const page = input === 'browse_shops' ? 1 : parseInt(input.replace('browse_shops_p', ''), 10) || 1;
        const skip = (page - 1) * BROWSE_PAGE_SIZE;

        const [merchants, total] = await Promise.all([
            db.merchant.findMany({
                where: { status: 'ACTIVE', manual_closed: false, show_in_browse: true } as any,
                orderBy: { trading_name: 'asc' },
                take: BROWSE_PAGE_SIZE,
                skip
            }),
            db.merchant.count({
                where: { status: 'ACTIVE', manual_closed: false, show_in_browse: true } as any
            })
        ]);

        if (total === 0) {
            await sendButtons(from, '🔍 No shops listed right now. Check back soon!', [
                { id: 'c_find_shop', title: '🔍 Find by Handle' },
                { id: 'c_home', title: '🏠 Home' }
            ]);
            return;
        }

        const totalPages = Math.ceil(total / BROWSE_PAGE_SIZE);

        const rows = merchants.map((m: any) => ({
            id: `@${m.handle}`,
            title: m.trading_name.substring(0, 24),
            description: `@${m.handle}`
        }));

        await sendListMessage(
            from,
            `🔥 *Browse Shops* — Page ${page} of ${totalPages}`,
            '🛒 Open a Shop',
            [{ title: 'Available Shops', rows }]
        );

        if (totalPages > 1) {
            const navBtns: Array<{ id: string; title: string }> = [];
            if (page > 1) navBtns.push({ id: `browse_shops_p${page - 1}`, title: `◀ Prev (${page - 1}/${totalPages})` });
            if (page < totalPages) navBtns.push({ id: `browse_shops_p${page + 1}`, title: `Next (${page + 1}/${totalPages}) ▶` });
            navBtns.push({ id: 'c_home', title: '🏠 Home' });
            await sendButtons(from, 'Navigate:', navBtns.slice(0, 3));
        }
        return;
    }

    await sendTextMessage(from, '🔍 To find a shop, type *@shophandle*\nOr type *browse_shops* to see all.');
};
