import { sendTextMessage, sendListMessage, sendImageMessage, sendButtons, sendInteractiveImageButtons } from './sender';
import { formatCurrency, buildMerchantWelcome } from './messageTemplates';
import { getPlatformBranding } from './platformBranding';
import { setCustomerLastMerchant, upsertMerchantCustomer } from './merchantCustomers';
import { createPaymentRequest } from '../payments/ozow';
import { db } from '../../lib/db';
import { getCustomerAddress, startAddressFlow } from './customerAddress';

const STORE_PROD_PAGE_SIZE = 3;
const BROWSE_PAGE_SIZE = 5;

// ── Product sort helpers ───────────────────────────────────────────────────────

const SORT_OPTIONS = [
    { code: 'new', label: 'Newest First',   shortLabel: '🆕 Newest'   },
    { code: 'old', label: 'Oldest First',   shortLabel: '⏳ Oldest'   },
    { code: 'lp',  label: 'Price: Low → High', shortLabel: '💸 Price ↑' },
    { code: 'hp',  label: 'Price: High → Low', shortLabel: '💰 Price ↓' },
    { code: 'az',  label: 'A → Z',          shortLabel: '🔤 A→Z'      },
    { code: 'za',  label: 'Z → A',          shortLabel: '🔤 Z→A'      },
];

const getSortShortLabel = (code: string): string =>
    SORT_OPTIONS.find(s => s.code === code)?.shortLabel ?? '🆕 Newest';

const getSortOrderBy = (code: string): any => {
    switch (code) {
        case 'old': return { createdAt: 'asc' };
        case 'lp':  return { price: 'asc' };
        case 'hp':  return { price: 'desc' };
        case 'az':  return { name: 'asc' };
        case 'za':  return { name: 'desc' };
        default:    return { createdAt: 'desc' };
    }
};

// Platform-level store categories for browsing
export const STORE_CATEGORIES = [
    { slug: 'food',     emoji: '🍔', label: 'Food & Drink' },
    { slug: 'fashion',  emoji: '👗', label: 'Fashion & Clothing' },
    { slug: 'beauty',   emoji: '💄', label: 'Beauty & Wellness' },
    { slug: 'tech',     emoji: '💻', label: 'Tech & Electronics' },
    { slug: 'home',     emoji: '🏠', label: 'Home & Living' },
    { slug: 'services', emoji: '🔧', label: 'Services' },
    { slug: 'general',  emoji: '📦', label: 'General' },
];

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

const cartItemCount = (cart: Cart | null): number =>
    cart?.items?.reduce((s, i) => s + i.qty, 0) || 0;

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
        { id: 'cart_edit_qty', title: '✏️ Edit Qty' }
    ]);
};

// ── Buy Now (direct payment — bypass cart) ───────────────────────────────────

const processBuyNow = async (
    from: string,
    merchant: any,
    productId: string,
    productName: string,
    price: number,
    platformBranding: any,
    deliveryAddress?: string | null
): Promise<void> => {
    const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: merchant.id } });

    const order = await db.order.create({
        data: {
            customer_id: from,
            merchant_id: merchant.id,
            total: price,
            items_summary: `1x ${productName}`,
            status: 'PENDING',
            order_items: { create: [{ product_id: productId, quantity: 1, price }] }
        }
    });

    // Notify merchant
    const deliveryLine = deliveryAddress ? `\n📦 Deliver to: ${deliveryAddress}` : '\n📦 Deliver to: No address provided';
    await sendTextMessage(
        merchant.wa_id,
        `🛒 *Buy Now Order! #${order.id.slice(-5)}*\n👤 Customer: ${from}\n📦 1x ${productName}\n💰 ${formatCurrency(price, { merchant, merchantBranding, platform: platformBranding })}${deliveryLine}`
    );

    try {
        const { paymentUrl, transactionRef } = await createPaymentRequest({
            orderId:      order.id,
            amount:       price,
            merchantName: merchant.handle.substring(0, 20)   // handle as bankRef per spec
        });
        await db.order.update({ where: { id: order.id }, data: { payment_ref: transactionRef, payment_url: paymentUrl } });

        const addrInfo = deliveryAddress ? `\n📦 Delivering to: ${deliveryAddress}` : '';
        await sendButtons(from,
            [
                `💳 *Pay for your order!*`,
                ``,
                `🏪 ${merchant.trading_name}`,
                `📦 ${productName}`,
                `💰 ${formatCurrency(price, { merchant, merchantBranding, platform: platformBranding })}${addrInfo}`,
                ``,
                paymentUrl
            ].join('\n'),
            [
                { id: `retry_payment_${order.id}`, title: '🔄 New Link' },
                { id: 'c_my_orders', title: '📦 My Orders' }
            ]
        );
    } catch (err: any) {
        console.error(`❌ Buy Now payment failed: ${err.message}`);
        await sendTextMessage(from, '⚠️ Could not generate payment link. Please try again.');
    }
};

// ── Store product page ────────────────────────────────────────────────────────

const sendStoreProductPage = async (from: string, merchantHandle: string, page: number, platformBranding: any, sortCode?: string): Promise<void> => {
    const merchant = await db.merchant.findFirst({
        where: { handle: merchantHandle.toLowerCase(), status: 'ACTIVE' }
    });

    if (!merchant) {
        await sendTextMessage(from, `❌ Shop *@${merchantHandle}* not found or is offline.`);
        return;
    }

    if (merchant.manual_closed) {
        await sendButtons(from,
            `🪪 *${merchant.trading_name}* is currently closed. Check back soon!`,
            [{ id: 'browse_shops', title: '🛍️ Browse Stores' }]
        );
        return;
    }

    await upsertMerchantCustomer(merchant.id, from);
    await setCustomerLastMerchant(from, merchant.id);

    const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: merchant.id } });

    // First-visit welcome
    if (page === 1) {
        const customerRecord = await db.merchantCustomer.findUnique({
            where: { merchant_id_wa_id: { merchant_id: merchant.id, wa_id: from } }
        });
        if (customerRecord && !customerRecord.has_seen_welcome) {
            await db.merchantCustomer.update({
                where: { merchant_id_wa_id: { merchant_id: merchant.id, wa_id: from } },
                data: { has_seen_welcome: true }
            });
            const heroImage = (merchant as any).welcome_image_url || merchantBranding?.logo_url || merchant.image_url;
            const welcomeText = buildMerchantWelcome(merchant, platformBranding);
            if (heroImage) {
                await sendImageMessage(from, heroImage, welcomeText);
            } else {
                await sendTextMessage(from, welcomeText);
            }
        }
    }

    // Load products
    const skip = (page - 1) * STORE_PROD_PAGE_SIZE;
    const [products, total] = await Promise.all([
        db.product.findMany({
            where: { merchant_id: merchant.id, status: 'ACTIVE' },
            include: { variants: true },
            orderBy: getSortOrderBy(sortCode || 'new'),
            take: STORE_PROD_PAGE_SIZE,
            skip
        }),
        db.product.count({ where: { merchant_id: merchant.id, status: 'ACTIVE' } })
    ]);

    if (products.length === 0 && page === 1) {
        await sendButtons(from,
            `📭 *${merchant.trading_name}* hasn't added any products yet. Check back soon!`,
            [{ id: 'browse_shops', title: '🛍️ Browse Stores' }, { id: 'c_home', title: '🏠 Home' }]
        );
        return;
    }

    if (products.length === 0) {
        // Past last page — go back to page 1
        await sendStoreProductPage(from, merchantHandle, 1, platformBranding);
        return;
    }

    const totalPages = Math.ceil(total / STORE_PROD_PAGE_SIZE);

    // Send each product as an interactive image card
    for (const product of products) {
        const inStockVariants = product.variants.filter((v: any) => v.is_in_stock);
        const hasVariants = product.variants.length > 0;
        const displayPrice = hasVariants
            ? Math.min(...product.variants.map((v: any) => v.price))
            : product.price;
        const stockBadge = product.is_in_stock ? '✅ In Stock' : '❌ Out of Stock';
        const priceStr = formatCurrency(displayPrice, { merchant, merchantBranding, platform: platformBranding });

        const caption = [
            `🛍️ *${product.name}*`,
            product.description ? product.description.substring(0, 100) : '',
            `💰 ${priceStr}  •  ${stockBadge}`
        ].filter(Boolean).join('\n');

        let buttons: Array<{ id: string; title: string }>;

        if (!product.is_in_stock) {
            buttons = [{ id: `wish_prod_${product.id}`, title: '❤️ Wishlist' }];
        } else if (hasVariants && inStockVariants.length > 0) {
            buttons = [
                { id: `vpick_${product.id}`, title: '🛍️ Choose Option' },
                { id: `wish_prod_${product.id}`, title: '❤️ Wishlist' }
            ];
        } else {
            buttons = [
                { id: `add_cart_prod_${product.id}`, title: '🛒 Add to Cart' },
                { id: `buy_now_prod_${product.id}`, title: '⚡ Buy Now' },
                { id: `prod_${product.id}`, title: '📖 More' }
            ];
        }

        if (product.image_url) {
            await sendInteractiveImageButtons(from, product.image_url, caption, buttons);
        } else {
            await sendButtons(from, caption, buttons);
        }
    }

    // Navigation — sort-aware pagination
    const cart = await getCart(from);
    const count = cartItemCount(cart);
    const hasPrev = page > 1;
    const hasNext = page < totalPages;

    const prevId = sortCode ? `spf_${merchantHandle}.${sortCode}.${page - 1}` : `sp_${merchantHandle}_${page - 1}`;
    const nextId = sortCode ? `spf_${merchantHandle}.${sortCode}.${page + 1}` : `sp_${merchantHandle}_${page + 1}`;

    const browseBtn = { id: 'browse_shops', title: '← Browse' };
    // Sort button: if sorted, resets to unsorted page 1; if not sorted, opens sort menu
    const sortBtn = sortCode
        ? { id: `sp_${merchantHandle}_1`, title: getSortShortLabel(sortCode).substring(0, 20) + ' ✕' }
        : { id: `ssort_${merchantHandle}`, title: '🔀 Sort' };

    const navBtns: Array<{ id: string; title: string }> = [];

    if (!hasPrev && !hasNext) {
        // Single page store — always room for sort + cart
        navBtns.push(browseBtn);
        navBtns.push(sortBtn);
        if (count > 0) navBtns.push({ id: 'c_cart', title: `🛒 Cart (${count})` });
    } else if (!hasPrev) {
        // Page 1 of many — sort replaces cart button
        navBtns.push(browseBtn);
        navBtns.push(sortBtn);
        navBtns.push({ id: nextId, title: 'Next ▶' });
    } else if (hasNext) {
        // Middle page — no room for sort
        navBtns.push({ id: prevId, title: '◀ Prev' });
        navBtns.push(browseBtn);
        navBtns.push({ id: nextId, title: 'Next ▶' });
    } else {
        // Last page — sort replaces cart button
        navBtns.push({ id: prevId, title: '◀ Prev' });
        navBtns.push(browseBtn);
        navBtns.push(sortBtn);
    }

    const sortLabel = sortCode ? ` • ${getSortShortLabel(sortCode)}` : '';
    const navText = `📄 Page ${page} of ${totalPages}  •  ${merchant.trading_name}${sortLabel}`;
    await sendButtons(from, navText, navBtns.slice(0, 3));
};

// ── Browse: category selection ────────────────────────────────────────────────

const sendCategorySelection = async (from: string): Promise<void> => {
    // Only show categories that have at least one active, browse-visible store
    const storesWithCats = await (db.merchant as any).findMany({
        where: { status: 'ACTIVE', show_in_browse: true, store_category: { not: null } },
        select: { store_category: true },
        distinct: ['store_category']
    });
    const activeSlugs = new Set<string>(
        storesWithCats.map((m: any) => m.store_category).filter(Boolean)
    );
    const totalStores = await (db.merchant as any).count({
        where: { status: 'ACTIVE', show_in_browse: true }
    });

    if (totalStores === 0) {
        await sendTextMessage(from, '🔍 No stores available right now. Check back soon!\n\n_Tip: Type @handle to visit a store directly._');
        return;
    }

    const rows: Array<{ id: string; title: string; description: string }> = [
        { id: 'bcat_all', title: '🛒 All Stores', description: `Browse all ${totalStores} shop${totalStores !== 1 ? 's' : ''}` }
    ];
    for (const cat of STORE_CATEGORIES) {
        if (activeSlugs.has(cat.slug)) {
            rows.push({ id: `bcat_${cat.slug}`, title: `${cat.emoji} ${cat.label}`, description: '' });
        }
    }

    await sendListMessage(from,
        '🏪 *Browse Stores*\n\nChoose a category, or type *@handle* to visit a shop directly.',
        '🏪 Browse',
        [{ title: 'Categories', rows }]
    );
};

// ── Browse: stores in a category ──────────────────────────────────────────────

const sendCategoryStores = async (from: string, slug: string, page: number): Promise<void> => {
    const isAll = slug === 'all';
    const categoryInfo = STORE_CATEGORIES.find(c => c.slug === slug);
    const categoryLabel = isAll ? '🛒 All Stores' : categoryInfo ? `${categoryInfo.emoji} ${categoryInfo.label}` : '🛒 Stores';

    const whereClause: any = { status: 'ACTIVE', manual_closed: false, show_in_browse: true };
    if (!isAll && categoryInfo) {
        whereClause.store_category = slug;
    }

    const skip = (page - 1) * BROWSE_PAGE_SIZE;
    const [merchants, total] = await Promise.all([
        db.merchant.findMany({
            where: whereClause,
            orderBy: { trading_name: 'asc' },
            take: BROWSE_PAGE_SIZE,
            skip
        }),
        db.merchant.count({ where: whereClause })
    ]);

    if (total === 0) {
        await sendButtons(from,
            `🔍 No stores in *${categoryLabel}* right now.\n\nBrowse another category or type *@handle* to visit a shop.`,
            [
                { id: 'browse_shops', title: '🏪 Browse Categories' },
                { id: 'bcat_all', title: '🛒 All Stores' }
            ]
        );
        return;
    }

    const totalPages = Math.ceil(total / BROWSE_PAGE_SIZE);

    // Top 3 trending stores (first page only)
    let topLine = '';
    if (page === 1 && merchants.length > 0) {
        const top = merchants.slice(0, 3).map((m: any) => `@${m.handle}`).join(' • ');
        topLine = `\n\n⭐ *Top stores:* ${top}`;
    }

    // List all stores on this page
    const storeList = merchants.map((m: any) => `@${m.handle} — ${m.trading_name}`).join('\n');

    const msg = [
        `${categoryLabel}  •  Page ${page} of ${totalPages}`,
        topLine,
        ``,
        storeList,
        ``,
        `_Type any @handle to visit a store_`
    ].filter(s => s !== undefined && s !== null).join('\n').trim();

    await sendTextMessage(from, msg);

    // Navigation buttons
    const navBtns: Array<{ id: string; title: string }> = [];
    if (page > 1) navBtns.push({ id: `bcat_${slug}_${page - 1}`, title: '◀ Prev' });
    if (page < totalPages) navBtns.push({ id: `bcat_${slug}_${page + 1}`, title: 'Next ▶' });
    navBtns.push({ id: 'browse_shops', title: '← Categories' });

    await sendButtons(from, `Browse ${categoryLabel}:`, navBtns.slice(0, 3));
};

// ── Cart qty update (text input flow) ────────────────────────────────────────

const processCartQtyUpdate = async (from: string, stateKey: string, qty: number, platformBranding: any): Promise<void> => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });

    const cart = await getCart(from);
    if (!cart || cart.items.length === 0) {
        await sendTextMessage(from, '⚠️ Your cart is empty.');
        return;
    }

    let itemName = '';
    if (stateKey.startsWith('cart_qty_v_')) {
        const variantId = stateKey.replace('cart_qty_v_', '');
        const idx = cart.items.findIndex(i => i.variant_id === variantId);
        if (idx === -1) { await sendTextMessage(from, '❌ Item not found in cart.'); return; }
        itemName = `${cart.items[idx].product_name}${cart.items[idx].variant_label ? ` (${cart.items[idx].variant_label})` : ''}`;
        if (qty === 0) { cart.items.splice(idx, 1); } else { cart.items[idx].qty = qty; }
    } else {
        const productId = stateKey.replace('cart_qty_', '');
        const idx = cart.items.findIndex(i => i.product_id === productId && !i.variant_id);
        if (idx === -1) { await sendTextMessage(from, '❌ Item not found in cart.'); return; }
        itemName = cart.items[idx].product_name;
        if (qty === 0) { cart.items.splice(idx, 1); } else { cart.items[idx].qty = qty; }
    }

    if (cart.items.length === 0) {
        await saveCart(from, null);
        await sendButtons(from, `🗑️ *${itemName}* removed. Cart is now empty.`, [
            { id: 'browse_shops', title: '🛍️ Browse Stores' }
        ]);
        return;
    }

    await saveCart(from, cart);
    await sendCartView(from, cart, platformBranding);
};

// ── Main handler ──────────────────────────────────────────────────────────────

export const handleCustomerDiscovery = async (from: string, input: string): Promise<void> => {
    const platformBranding = await getPlatformBranding(db);

    // ── Cart qty text input flow ───────────────────────────────────────────────
    const sessionState = await db.userSession.findUnique({ where: { wa_id: from }, select: { active_prod_id: true } });
    if (sessionState?.active_prod_id?.startsWith('cart_qty_')) {
        const qty = parseInt(input.trim());
        if (!isNaN(qty) && qty >= 0) {
            await processCartQtyUpdate(from, sessionState.active_prod_id, qty, platformBranding);
            return;
        }
        // Non-numeric — clear state and fall through to normal routing
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
    }

    // ── Buy Now address resume (after address was saved via ADDR_FLOW) ─────────
    if (input.startsWith('resume_bnp_')) {
        const productId = input.replace('resume_bnp_', '');
        const addr = await getCustomerAddress(from);
        const product = await db.product.findUnique({ where: { id: productId }, include: { merchant: true } });
        if (!product || !product.merchant) { await sendTextMessage(from, '❌ Item no longer available.'); return; }
        await processBuyNow(from, product.merchant, product.id, product.name, product.price, platformBranding, addr);
        return;
    }

    if (input.startsWith('resume_bnv_')) {
        const variantId = input.replace('resume_bnv_', '');
        const addr = await getCustomerAddress(from);
        const variant = await db.productVariant.findUnique({
            where: { id: variantId },
            include: { product: { include: { merchant: true } } }
        });
        if (!variant || !variant.product?.merchant) { await sendTextMessage(from, '❌ Item no longer available.'); return; }
        await processBuyNow(from, variant.product.merchant, variant.product_id, variant.product.name, variant.price, platformBranding, addr);
        return;
    }

    // ── View cart ─────────────────────────────────────────────────────────────
    if (input === 'c_cart') {
        const cart = await getCart(from);
        if (!cart || cart.items.length === 0) {
            await sendButtons(from, '🛒 Your cart is empty.', [
                { id: 'browse_shops', title: '🛍️ Browse Stores' },
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
            { id: 'browse_shops', title: '🛍️ Browse Stores' },
            { id: 'c_home', title: '🏠 Home' }
        ]);
        return;
    }

    // ── Edit cart quantities ───────────────────────────────────────────────────
    if (input === 'cart_edit_qty') {
        const cart = await getCart(from);
        if (!cart || cart.items.length === 0) {
            await sendButtons(from, '🛒 Your cart is empty.', [
                { id: 'browse_shops', title: '🛍️ Browse Stores' }
            ]);
            return;
        }
        const rows = cart.items.slice(0, 8).map(item => {
            const label = item.variant_label ? ` (${item.variant_label})` : '';
            return {
                id: item.variant_id ? `cedit_v_${item.variant_id}` : `cedit_${item.product_id}`,
                title: `${item.product_name}${label}`.substring(0, 24),
                description: `Qty: ${item.qty}`
            };
        });
        rows.push({ id: 'cart_clear', title: '🗑️ Clear Entire Cart', description: 'Remove all items' });
        await sendListMessage(from, '✏️ *Edit Cart*\n\nSelect an item to change its quantity:', '✏️ Edit', [{ title: 'Cart Items', rows }]);
        return;
    }

    // ── Select item for qty edit ───────────────────────────────────────────────
    if (input.startsWith('cedit_')) {
        const cart = await getCart(from);
        if (!cart || cart.items.length === 0) {
            await sendTextMessage(from, '⚠️ Your cart is empty.');
            return;
        }

        let itemName = '';
        let stateKey = '';

        if (input.startsWith('cedit_v_')) {
            const variantId = input.replace('cedit_v_', '');
            const item = cart.items.find(i => i.variant_id === variantId);
            if (!item) { await sendTextMessage(from, '❌ Item not found in cart.'); return; }
            itemName = `${item.product_name}${item.variant_label ? ` (${item.variant_label})` : ''}`;
            stateKey = `cart_qty_v_${variantId}`;
        } else {
            const productId = input.replace('cedit_', '');
            const item = cart.items.find(i => i.product_id === productId && !i.variant_id);
            if (!item) { await sendTextMessage(from, '❌ Item not found in cart.'); return; }
            itemName = item.product_name;
            stateKey = `cart_qty_${productId}`;
        }

        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: stateKey } });
        await sendButtons(from,
            `✏️ *${itemName}*\n\nEnter new quantity (or 0 to remove):`,
            [{ id: 'c_cart', title: '↩️ Cancel' }]
        );
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

        const deliveryAddr = await getCustomerAddress(from);
        const addrLine = deliveryAddr
            ? `\n\n📦 *Delivering to:* ${deliveryAddr}`
            : '\n\n📍 _No delivery address saved_';
        summary += addrLine;

        await sendButtons(from, summary, [
            { id: 'cart_confirm_order', title: '✅ Confirm & Pay' },
            { id: 'cart_addr', title: '📍 Add/Change Address' },
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

        await saveCart(from, null);

        // Notify merchant
        const cartDeliveryAddr = await getCustomerAddress(from);
        const notif = [
            `🛒 *New Order! #${order.id.slice(-5)}*`,
            `👤 Customer: ${from}`,
            `━━━━━━━━━━━━━━━━━━━━`,
            itemsSummary,
            `━━━━━━━━━━━━━━━━━━━━`,
            `💰 Total: ${formatCurrency(total, { merchant, merchantBranding, platform: platformBranding })}`,
            `📦 Deliver to: ${cartDeliveryAddr || 'No address provided'}`
        ].join('\n');
        await sendTextMessage(merchant.wa_id, notif);

        // Payment
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
            console.error(`❌ Ozow payment failed: ${payErr.message}`);
            await sendButtons(from,
                [
                    `✅ *Order #${order.id.slice(-5)} placed!*`,
                    ``,
                    `🏪 ${merchant.trading_name}`,
                    `💰 ${formatCurrency(total, { merchant, merchantBranding, platform: platformBranding })}`,
                    ``,
                    `⚠️ _Payment link could not be generated. The shop will contact you._`
                ].join('\n'),
                [
                    { id: 'c_my_orders', title: '📦 My Orders' },
                    { id: 'browse_shops', title: '🛍️ Browse More' }
                ]
            );
        }
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
        await sendButtons(
            from,
            added ? `❤️ *${product.name}* saved to Wishlist!` : `💔 *${product.name}* removed from Wishlist.`,
            [
                added
                    ? { id: `wish_prod_${productId}`, title: '💔 Remove Wishlist' }
                    : { id: `wish_prod_${productId}`, title: '❤️ Wishlist' },
                { id: `@${product.merchant.handle}`, title: '🏪 Back to Store' }
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
            take: 8
        });

        if (entries.length === 0) {
            await sendButtons(from, '❤️ Your Wishlist is empty.\n\nBrowse shops and save items you love!', [
                { id: 'browse_shops', title: '🛍️ Browse Stores' },
                { id: 'c_account', title: '↩️ My Account' }
            ]);
            return;
        }

        const rows = entries.map((e: any) => ({
            id: `prod_${e.product.id}`,
            title: e.product.name.substring(0, 24),
            description: `${e.product.merchant?.trading_name || 'Shop'}`
        }));

        await sendListMessage(from,
            `❤️ *Your Wishlist* (${entries.length} item${entries.length !== 1 ? 's' : ''})`,
            '👀 View Item',
            [{ title: 'Saved Items', rows }]
        );
        return;
    }

    // ── Buy Now (product, no variant) ─────────────────────────────────────────
    if (input.startsWith('buy_now_prod_')) {
        const productId = input.replace('buy_now_prod_', '');
        const product = await db.product.findUnique({
            where: { id: productId },
            include: { merchant: true, variants: true }
        });

        if (!product || !product.merchant || product.status !== 'ACTIVE') {
            await sendTextMessage(from, '❌ Item not found.');
            return;
        }

        if (!product.is_in_stock) {
            await sendTextMessage(from, '😔 This item is currently out of stock.');
            return;
        }

        // If product has variants, redirect to variant picker
        if (product.variants.length > 0) {
            await handleCustomerDiscovery(from, `vpick_${productId}`);
            return;
        }

        await upsertMerchantCustomer(product.merchant.id, from);
        await setCustomerLastMerchant(from, product.merchant.id);
        const addrBuyNow = await getCustomerAddress(from);
        if (!addrBuyNow) {
            await startAddressFlow(from, `resume_bnp_${product.id}`);
            return;
        }
        await processBuyNow(from, product.merchant, product.id, product.name, product.price, platformBranding, addrBuyNow);
        return;
    }

    // ── Buy Now (specific variant) ────────────────────────────────────────────
    if (input.startsWith('buy_now_variant_')) {
        const variantId = input.replace('buy_now_variant_', '');
        const variant = await db.productVariant.findUnique({
            where: { id: variantId },
            include: { product: { include: { merchant: true } } }
        });

        if (!variant || !variant.product?.merchant) {
            await sendTextMessage(from, '❌ Item not found.');
            return;
        }

        if (!variant.is_in_stock) {
            await sendTextMessage(from, '😔 This option is out of stock.');
            return;
        }

        await upsertMerchantCustomer(variant.product.merchant.id, from);
        await setCustomerLastMerchant(from, variant.product.merchant.id);
        const addrVariant = await getCustomerAddress(from);
        if (!addrVariant) {
            await startAddressFlow(from, `resume_bnv_${variantId}`);
            return;
        }
        await processBuyNow(from, variant.product.merchant, variant.product_id, variant.product.name, variant.price, platformBranding, addrVariant);
        return;
    }

    // ── Variant picker (from store listing) ───────────────────────────────────
    if (input.startsWith('vpick_')) {
        const productId = input.replace('vpick_', '');
        const product = await db.product.findUnique({
            where: { id: productId },
            include: { variants: true, merchant: true }
        });

        if (!product || !product.merchant) {
            await sendTextMessage(from, '❌ Product not found.');
            return;
        }

        const merchantBranding = await db.merchantBranding.findUnique({ where: { merchant_id: product.merchant.id } });
        const inStockVariants = product.variants.filter((v: any) => v.is_in_stock);

        if (inStockVariants.length === 0) {
            await sendButtons(from, `😔 *${product.name}* has no options available right now.`, [
                { id: `@${product.merchant.handle}`, title: '↩️ Back to Store' }
            ]);
            return;
        }

        if (inStockVariants.length <= 3) {
            const variantButtons = inStockVariants.map((v: any) => ({
                id: `variant_${v.id}`,
                title: [v.size, v.color].filter(Boolean).join(' · ').substring(0, 20) || 'Standard'
            }));
            await sendButtons(from,
                `🛍️ *${product.name}*\n\nChoose your option:`,
                variantButtons
            );
        } else {
            // More than 3 variants — use list
            const rows = inStockVariants.map((v: any) => ({
                id: `variant_${v.id}`,
                title: [v.size, v.color].filter(Boolean).join(' · ').substring(0, 24) || 'Standard',
                description: formatCurrency(v.price, { merchant: product.merchant!, merchantBranding, platform: platformBranding })
            }));
            await sendListMessage(from,
                `🛍️ *${product.name}*\n\nChoose your option:`,
                '🛍️ Select',
                [{ title: 'Options', rows }]
            );
        }
        return;
    }

    // ── Add product to cart → return to store ─────────────────────────────────
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
        const newCount = cartItemCount(cart);
        await sendButtons(from,
            `🛒 *${product.name}* added!\n_${newCount} item${newCount !== 1 ? 's' : ''} in cart_`,
            [
                { id: 'c_cart', title: `🛒 Cart (${newCount})` },
                { id: `sp_${product.merchant.handle}_1`, title: '🛍️ Keep Shopping' }
            ]
        );
        return;
    }

    // ── Add variant to cart → return to store ─────────────────────────────────
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

        const variantLabel = [variant.size, variant.color].filter(Boolean).join(' · ');
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
        const newCountV = cartItemCount(cart);
        const addedLabel = variantLabel ? ` (${variantLabel})` : '';
        await sendButtons(from,
            `🛒 *${variant.product.name}${addedLabel}* added!\n_${newCountV} item${newCountV !== 1 ? 's' : ''} in cart_`,
            [
                { id: 'c_cart', title: `🛒 Cart (${newCountV})` },
                { id: `sp_${merchant.handle}_1`, title: '🛍️ Keep Shopping' }
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

    // ── Product detail (from wishlist / direct link) ──────────────────────────
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
            const rows = product.variants.map((v: any) => ({
                id: `variant_${v.id}`,
                title: `${v.size || 'Standard'}${v.color ? ` · ${v.color}` : ''}`.substring(0, 24),
                description: [
                    formatCurrency(v.price, { merchant: product.merchant!, merchantBranding, platform: platformBranding }),
                    v.is_in_stock ? '' : '❌ Out of Stock'
                ].filter(Boolean).join('  •  ')
            }));
            await sendListMessage(from, '👇 Pick your option:', '🛍️ Choose Option', [{ title: 'Options', rows }]);
            return;
        }

        const wishlisted = await isWishlisted(from, product.id);
        const wishBtn = wishlisted
            ? { id: `wish_prod_${product.id}`, title: '💔 Remove Wishlist' }
            : { id: `wish_prod_${product.id}`, title: '❤️ Wishlist' };

        if (product.is_in_stock) {
            await sendButtons(from, '⚡ Ready to order?', [
                { id: `add_cart_prod_${product.id}`, title: '🛒 Add to Cart' },
                { id: `buy_now_prod_${product.id}`, title: '⚡ Buy Now' },
                wishBtn
            ]);
        } else {
            await sendButtons(from, '😔 This item is out of stock.', [
                wishBtn,
                { id: `@${product.merchant.handle}`, title: '↩️ Back to Store' }
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
            await sendTextMessage(from, '❌ Option not found.');
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
            `💰 ${priceStr}  •  ${stockBadge}`
        ].filter(Boolean).join('\n');

        if (variant.product.image_url) {
            await sendInteractiveImageButtons(
                from,
                variant.product.image_url,
                caption,
                variant.is_in_stock
                    ? [
                        { id: `add_cart_variant_${variant.id}`, title: '🛒 Add to Cart' },
                        { id: `buy_now_variant_${variant.id}`, title: '⚡ Buy Now' },
                        { id: `@${variant.product.merchant.handle}`, title: '↩️ Back to Store' }
                    ]
                    : [
                        { id: `wish_prod_${variant.product.id}`, title: '❤️ Wishlist' },
                        { id: `@${variant.product.merchant.handle}`, title: '↩️ Back to Store' }
                    ]
            );
        } else {
            await sendButtons(from, caption,
                variant.is_in_stock
                    ? [
                        { id: `add_cart_variant_${variant.id}`, title: '🛒 Add to Cart' },
                        { id: `buy_now_variant_${variant.id}`, title: '⚡ Buy Now' },
                        { id: `@${variant.product.merchant.handle}`, title: '↩️ Back to Store' }
                    ]
                    : [
                        { id: `wish_prod_${variant.product.id}`, title: '❤️ Wishlist' },
                        { id: `@${variant.product.merchant.handle}`, title: '↩️ Back to Store' }
                    ]
            );
        }
        return;
    }

    // ── Sort menu ─────────────────────────────────────────────────────────────
    if (input.startsWith('ssort_')) {
        // ssort_{handle} — show sort options as list
        const handle = input.replace('ssort_', '');
        await sendListMessage(
            from,
            `How would you like to sort *@${handle}*'s products?`,
            '🔀 Choose Sort',
            [{
                title: 'Sort Options',
                rows: SORT_OPTIONS.map(opt => ({
                    id:          `spf_${handle}.${opt.code}.1`,
                    title:       opt.shortLabel,
                    description: opt.label
                }))
            }]
        );
        return;
    }

    // ── Sorted store page ─────────────────────────────────────────────────────
    if (input.startsWith('spf_')) {
        // spf_{handle}.{sortCode}.{page}
        const rest = input.replace('spf_', '');
        const firstDot = rest.indexOf('.');
        const lastDot = rest.lastIndexOf('.');
        if (firstDot === -1 || firstDot === lastDot) {
            await sendTextMessage(from, '⚠️ Invalid sort link.');
            return;
        }
        const handle = rest.substring(0, firstDot);
        const sortCode = rest.substring(firstDot + 1, lastDot);
        const page = parseInt(rest.substring(lastDot + 1)) || 1;
        await sendStoreProductPage(from, handle, page, platformBranding, sortCode);
        return;
    }

    // ── Store page (paginated) ────────────────────────────────────────────────
    if (input.startsWith('sp_')) {
        // sp_{handle}_{page}
        const rest = input.replace('sp_', '');
        const lastUnderscore = rest.lastIndexOf('_');
        if (lastUnderscore === -1) {
            await sendTextMessage(from, '⚠️ Invalid store link.');
            return;
        }
        const handle = rest.substring(0, lastUnderscore);
        const page = parseInt(rest.substring(lastUnderscore + 1)) || 1;
        await sendStoreProductPage(from, handle, page, platformBranding);
        return;
    }

    // ── Shop via @handle ──────────────────────────────────────────────────────
    if (input.startsWith('@')) {
        const handle = input.replace('@', '').split(/\s+/)[0].toLowerCase().trim();
        if (!handle) {
            await sendTextMessage(from, '⚠️ Please enter a shop handle after @\n\nExample: *@shopname*');
            return;
        }
        await sendStoreProductPage(from, handle, 1, platformBranding);
        return;
    }

    // ── Browse stores ─────────────────────────────────────────────────────────
    if (input === 'browse_shops' || input.startsWith('browse_shops_p')) {
        await sendCategorySelection(from);
        return;
    }

    // ── Category browse ───────────────────────────────────────────────────────
    if (input.startsWith('bcat_')) {
        const rest = input.replace('bcat_', '');
        const parts = rest.split('_');
        const lastPart = parts[parts.length - 1];
        const hasPageNum = /^\d+$/.test(lastPart) && parts.length > 1;
        const page = hasPageNum ? parseInt(lastPart) : 1;
        const slug = hasPageNum ? parts.slice(0, -1).join('_') : rest;
        await sendCategoryStores(from, slug, page);
        return;
    }

    await sendTextMessage(from, '🔍 To find a shop, type *@shophandle*\nOr type *browse* to see all stores.');
};
