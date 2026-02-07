import { PrismaClient, Merchant, UserSession } from '@prisma/client';
import { sendTextMessage, sendButtons, sendListMessage } from './sender';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

const logAudit = async ({
    actorWaId,
    action,
    entityType,
    entityId,
    metadata
}: {
    actorWaId: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown> | null;
}): Promise<void> => {
    await db.auditLog.create({
        data: {
            actor_wa_id: actorWaId,
            action,
            entity_type: entityType,
            entity_id: entityId,
            metadata_json: metadata ?? undefined
        }
    });
};

const STATE = {
    NAME: 'ADD_NAME',
    CATEGORY: 'ADD_CATEGORY',
    PRICE: 'ADD_PRICE_',
    IMAGE: 'ADD_IMG_',
    PREVIEW: 'ADD_PREVIEW_',
    DELETE: 'DEL_',
    CAT_NAME: 'CAT_NAME',
    CAT_DESC: 'CAT_DESC',
    VAR_SIZE: 'VAR_SIZE',
    VAR_COLOR: 'VAR_COLOR',
    VAR_SKU: 'VAR_SKU',
    VAR_PRICE: 'VAR_PRICE',
    EDIT_VARIANT: 'EDIT_VARIANT',
    EDIT_CATEGORY: 'EDIT_CATEGORY'
};

const buildState = (key: string, ...parts: string[]) => [key, ...parts].join('|');
const parseState = (state: string) => (state ? state.split('|') : []);

export const handleInventoryActions = async (
    from: string, 
    input: string, 
    session: UserSession, 
    merchant: Merchant, 
    message?: any
): Promise<void> => {
    try {
        const state = session.active_prod_id || '';
        const stateParts = parseState(state);
        const stateKey = stateParts[0];

        // Menu
        if (input === 'm_inventory' || input === 'p_back') {
            await clearState(from);
            const count = await db.product.count({ where: { merchant_id: merchant.id, status: 'ACTIVE' } });
            await sendButtons(from, `📦 *Menu Manager*\n\n${count} active items`, [
                { id: 'm_add_prod', title: '➕ Add Item' },
                { id: 'm_categories', title: '📂 Categories' },
                { id: 'p_view_all', title: '👀 View Menu' },
                { id: 'm_dashboard', title: '🏠 Dashboard' }
            ]);
            return;
        }

        if (input === 'm_categories') {
            const categories = await db.category.findMany({
                where: { merchant_id: merchant.id },
                orderBy: { name: 'asc' },
                take: 10
            });

            if (categories.length === 0) {
                await sendTextMessage(from, '📂 No categories yet. Add your first one.');
                await sendButtons(from, 'Actions:', [
                    { id: 'cat_add', title: '➕ Add Category' },
                    { id: 'm_inventory', title: '⬅️ Back' }
                ]);
                return;
            }

            const rows = categories.map(cat => ({
                id: `edit_cat_${cat.id}`,
                title: cat.name.substring(0, 24),
                description: cat.description ? cat.description.substring(0, 40) : 'No description'
            }));

            await sendListMessage(from, `📂 *Categories* (${categories.length})`, '📋 View Categories', [
                { title: 'Categories', rows }
            ]);
            await sendButtons(from, 'Actions:', [
                { id: 'cat_add', title: '➕ Add Category' },
                { id: 'm_inventory', title: '⬅️ Back' }
            ]);
            return;
        }

        if (input === 'cat_add') {
            await setState(from, buildState(STATE.CAT_NAME));
            await sendTextMessage(from, '📂 *Add Category*\n\nWhat is the category name?\n\n_Type "cancel" to exit_');
            return;
        }

        // View all products
        if (input === 'p_view_all') {
            const products = await db.product.findMany({ 
                where: { merchant_id: merchant.id, status: 'ACTIVE' },
                orderBy: { name: 'asc' },
                take: 10
            });
            
            if (products.length === 0) {
                await sendTextMessage(from, '📭 Your menu is empty. Add your first item!');
                await handleInventoryActions(from, 'm_inventory', session, merchant);
                return;
            }

            const rows = products.map(p => ({
                id: `edit_prod_${p.id}`,
                title: p.name.substring(0, 24),
                description: `R${p.price.toFixed(2)} • ${p.is_in_stock ? '🟢' : '🔴'}`
            }));

            await sendListMessage(from, `📦 *Your Menu* (${products.length} items)`, '📋 View Items', [{ title: 'Products', rows }]);
            await sendButtons(from, 'Actions:', [{ id: 'm_add_prod', title: '➕ Add Item' }, { id: 'p_back', title: '⬅️ Back' }]);
            return;
        }

        // Edit product
        if (input.startsWith('edit_prod_')) {
            const pid = input.replace('edit_prod_', '');
            const p = await db.product.findUnique({ where: { id: pid }, include: { category: true } });
            if (!p) { await sendTextMessage(from, '❌ Product not found.'); return; }

            await sendButtons(from, `📦 *${p.name}*\n\nR${p.price.toFixed(2)}\n${p.category ? `📂 ${p.category.name}\n` : ''}${p.is_in_stock ? '🟢 In Stock' : '🔴 Out of Stock'}`, [
                { id: `toggle_${p.id}`, title: p.is_in_stock ? '🔴 Out of Stock' : '🟢 In Stock' },
                { id: `delete_prod_${p.id}`, title: '🗑️ Delete' }
            ]);
            await sendButtons(from, 'More Actions:', [
                { id: `edit_category_${p.id}`, title: '📂 Category' },
                { id: `view_variants_${p.id}`, title: '🎨 Variants' },
                { id: `add_variant_${p.id}`, title: '➕ Variant' }
            ]);
            await sendButtons(from, 'Nav:', [{ id: 'p_view_all', title: '⬅️ Back' }]);
            return;
        }

        if (input.startsWith('view_variants_')) {
            const pid = input.replace('view_variants_', '');
            const product = await db.product.findUnique({ where: { id: pid } });
            if (!product || product.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Product not found.');
                return;
            }

            const variants = await db.productVariant.findMany({
                where: { product_id: pid },
                orderBy: { createdAt: 'desc' },
                take: 10
            });

            if (variants.length === 0) {
                await sendTextMessage(from, `🎨 *${product.name}* has no variants yet.`);
                await sendButtons(from, 'Actions:', [
                    { id: `add_variant_${pid}`, title: '➕ Add Variant' },
                    { id: `edit_prod_${pid}`, title: '⬅️ Back' }
                ]);
                return;
            }

            const rows = variants.map(v => ({
                id: `edit_variant_${v.id}`,
                title: `${v.size || 'Standard'}${v.color ? ` • ${v.color}` : ''}`.substring(0, 24),
                description: `R${v.price.toFixed(2)}${v.sku ? ` • ${v.sku}` : ''}`
            }));

            await sendListMessage(from, `🎨 *${product.name} Variants* (${variants.length})`, '📋 View Variants', [
                { title: 'Variants', rows }
            ]);
            await sendButtons(from, 'Actions:', [
                { id: `add_variant_${pid}`, title: '➕ Add Variant' },
                { id: `edit_prod_${pid}`, title: '⬅️ Back' }
            ]);
            return;
        }

        if (input.startsWith('edit_variant_')) {
            const vid = input.replace('edit_variant_', '');
            const variant = await db.productVariant.findUnique({
                where: { id: vid },
                include: { product: true }
            });
            if (!variant || variant.product.merchant_id !== merchant.id) {
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

            await sendButtons(from, `🎨 *Variant Details*\n\n${details}`, [
                { id: `variant_field_${variant.id}_size`, title: '✏️ Size' },
                { id: `variant_field_${variant.id}_color`, title: '🎨 Color' },
                { id: `variant_field_${variant.id}_sku`, title: '🏷️ SKU' }
            ]);
            await sendButtons(from, 'More:', [
                { id: `variant_field_${variant.id}_price`, title: '💰 Price' },
                { id: `variant_delete_${variant.id}`, title: '🗑️ Delete' }
            ]);
            await sendButtons(from, 'Nav:', [{ id: `view_variants_${variant.product_id}`, title: '⬅️ Back' }]);
            return;
        }

        if (input.startsWith('variant_field_')) {
            const [, , vid, field] = input.split('_');
            const variant = await db.productVariant.findUnique({ where: { id: vid }, include: { product: true } });
            if (!variant || variant.product.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Variant not found.');
                return;
            }

            await setState(from, buildState(STATE.EDIT_VARIANT, vid, field));
            const fieldLabel = field === 'price' ? 'price' : field;
            await sendTextMessage(from, `✏️ Update ${fieldLabel} for *${variant.product.name}*.\n\n_Type "clear" to remove (except price)._`);
            return;
        }

        if (stateKey === STATE.EDIT_VARIANT) {
            const variantId = stateParts[1];
            const field = stateParts[2];
            const variant = await db.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
            if (!variant || variant.product.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Variant not found.');
                await clearState(from);
                return;
            }

            if (field === 'price') {
                const price = parseFloat(input.replace(',', '.').replace(/[^\d.]/g, ''));
                if (isNaN(price) || price <= 0 || price > 99999) {
                    await sendTextMessage(from, '⚠️ Enter a valid price (e.g., 45.50)');
                    return;
                }
                await db.productVariant.update({ where: { id: variantId }, data: { price } });
            } else {
                const value = input.toLowerCase() === 'clear' ? null : input.trim();
                await db.productVariant.update({ where: { id: variantId }, data: { [field]: value } });
            }

            await clearState(from);
            await handleInventoryActions(from, `edit_variant_${variantId}`, session, merchant);
            return;
        }

        if (input.startsWith('variant_delete_')) {
            const vid = input.replace('variant_delete_', '');
            const variant = await db.productVariant.findUnique({ where: { id: vid }, include: { product: true } });
            if (!variant || variant.product.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Variant not found.');
                return;
            }
            await db.productVariant.delete({ where: { id: vid } });
            await sendTextMessage(from, '🗑️ Variant deleted.');
            await handleInventoryActions(from, `view_variants_${variant.product_id}`, session, merchant);
            return;
        }

        if (input.startsWith('add_variant_')) {
            const pid = input.replace('add_variant_', '');
            const product = await db.product.findUnique({ where: { id: pid } });
            if (!product || product.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Product not found.');
                return;
            }
            await setSessionData(from, { variantDraft: { productId: pid } });
            await setState(from, buildState(STATE.VAR_SIZE, pid));
            await sendTextMessage(from, `🎨 *Add Variant for ${product.name}*\n\nStep 1/4: Enter size (or type "skip").`);
            return;
        }

        // Toggle stock
        if (input.startsWith('toggle_')) {
            const pid = input.replace('toggle_', '');
            const p = await db.product.findUnique({ where: { id: pid } });
            if (!p || p.merchant_id !== merchant.id) { await sendTextMessage(from, '❌ Not found.'); return; }
            
            const updated = await db.product.update({ where: { id: pid }, data: { is_in_stock: !p.is_in_stock } });
            await logAudit({
                actorWaId: from,
                action: 'PRODUCT_UPDATED',
                entityType: 'PRODUCT',
                entityId: updated.id,
                metadata: { is_in_stock: updated.is_in_stock }
            });
            await sendTextMessage(from, `✅ *${updated.name}* is now ${updated.is_in_stock ? '🟢 In Stock' : '🔴 Out of Stock'}`);
            await handleInventoryActions(from, 'p_view_all', session, merchant);
            return;
        }

        // Delete confirmation
        if (input.startsWith('delete_prod_')) {
            const pid = input.replace('delete_prod_', '');
            const p = await db.product.findUnique({ where: { id: pid } });
            if (!p) { await sendTextMessage(from, '❌ Not found.'); return; }
            
            await setState(from, `${STATE.DELETE}${pid}`);
            await sendButtons(from, `⚠️ Delete *${p.name}*?`, [
                { id: `confirm_del_${pid}`, title: '🗑️ Yes, Delete' },
                { id: 'cancel_delete', title: '❌ Cancel' }
            ]);
            return;
        }

        if (input.startsWith('confirm_del_')) {
            const pid = input.replace('confirm_del_', '');
            const p = await db.product.findUnique({ where: { id: pid } });
            if (p && p.merchant_id === merchant.id) {
                await db.product.delete({ where: { id: pid } });
                await logAudit({
                    actorWaId: from,
                    action: 'PRODUCT_DELETED',
                    entityType: 'PRODUCT',
                    entityId: pid,
                    metadata: { name: p.name }
                });
                await sendTextMessage(from, `🗑️ *${p.name}* deleted.`);
            }
            await clearState(from);
            await handleInventoryActions(from, 'p_view_all', session, merchant);
            return;
        }

        if (input === 'cancel_delete') {
            await clearState(from);
            await handleInventoryActions(from, 'p_view_all', session, merchant);
            return;
        }

        // === ADD PRODUCT FLOW ===
        
        if (input === 'm_add_prod') {
            await setState(from, STATE.NAME);
            await sendTextMessage(from, '🛒 *Add New Item*\n\n*Step 1/3:* What is the product name?\n\n_Type "cancel" to exit_');
            return;
        }

        if (input.toLowerCase() === 'cancel' && stateKey?.startsWith('ADD_')) {
            // Cleanup draft
            if ([STATE.PRICE, STATE.IMAGE, STATE.PREVIEW, STATE.CATEGORY].includes(stateKey)) {
                const pid = stateParts[1];
                try { await db.product.delete({ where: { id: pid } }); } catch {}
            }
            await clearState(from);
            await sendTextMessage(from, '❌ Cancelled.');
            await handleInventoryActions(from, 'm_inventory', session, merchant);
            return;
        }

        if (input.toLowerCase() === 'cancel' && stateKey === STATE.CAT_NAME) {
            const productId = stateParts[1];
            if (productId) {
                try { await db.product.delete({ where: { id: productId } }); } catch {}
            }
            await clearState(from);
            await sendTextMessage(from, '❌ Cancelled.');
            await handleInventoryActions(from, 'm_inventory', session, merchant);
            return;
        }

        if (input.toLowerCase() === 'cancel' && stateKey === STATE.CAT_DESC) {
            const productId = stateParts[2];
            if (productId) {
                try { await db.product.delete({ where: { id: productId } }); } catch {}
            }
            await clearState(from);
            await sendTextMessage(from, '❌ Cancelled.');
            await handleInventoryActions(from, 'm_inventory', session, merchant);
            return;
        }

        if (input.toLowerCase() === 'cancel' && [STATE.VAR_SIZE, STATE.VAR_COLOR, STATE.VAR_SKU, STATE.VAR_PRICE, STATE.EDIT_VARIANT, STATE.EDIT_CATEGORY].includes(stateKey)) {
            await clearState(from);
            await setSessionData(from, null);
            await sendTextMessage(from, '❌ Cancelled.');
            await handleInventoryActions(from, 'm_inventory', session, merchant);
            return;
        }

        // Step 1: Name
        if (stateKey === STATE.NAME) {
            if (input.length < 2 || input.length > 50) {
                await sendTextMessage(from, '⚠️ Name must be 2-50 characters.');
                return;
            }
            const product = await db.product.create({
                data: { name: input.trim(), price: 0, merchant_id: merchant.id, is_in_stock: false, status: 'DRAFT' }
            });
            await setState(from, buildState(STATE.CATEGORY, product.id));

            const categories = await db.category.findMany({
                where: { merchant_id: merchant.id },
                orderBy: { name: 'asc' },
                take: 9
            });

            if (categories.length === 0) {
                await sendTextMessage(from, `✅ *${input}*\n\n*Step 2/4:* Enter a category name or type "skip".`);
                return;
            }

            const rows = categories.map(cat => ({
                id: `select_cat_${product.id}_${cat.id}`,
                title: cat.name.substring(0, 24),
                description: cat.description ? cat.description.substring(0, 40) : 'No description'
            }));
            rows.unshift({
                id: `select_cat_${product.id}_none`,
                title: 'No Category',
                description: 'Skip category assignment'
            });
            rows.push({
                id: `cat_add_for_${product.id}`,
                title: '➕ New Category',
                description: 'Create a new category'
            });

            await sendListMessage(from, `✅ *${input}*\n\n*Step 2/4:* Choose a category`, '📂 Select Category', [
                { title: 'Categories', rows }
            ]);
            return;
        }

        if (input.startsWith('select_cat_')) {
            const [, , pid, cid] = input.split('_');
            const product = await db.product.findUnique({ where: { id: pid } });
            if (!product || product.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Product not found.');
                return;
            }

            const categoryId = cid === 'none' ? null : cid;
            await db.product.update({ where: { id: pid }, data: { category_id: categoryId } });

            if (stateKey === STATE.CATEGORY) {
                await setState(from, buildState(STATE.PRICE, pid));
                await sendTextMessage(from, `📂 Category saved.\n\n*Step 3/4:* What is the price?\n\n_Example: 45.50_`);
                return;
            }

            await sendTextMessage(from, '✅ Category updated.');
            await handleInventoryActions(from, `edit_prod_${pid}`, session, merchant);
            return;
        }

        if (input.startsWith('cat_add_for_')) {
            const pid = input.replace('cat_add_for_', '');
            await setState(from, buildState(STATE.CAT_NAME, pid));
            await sendTextMessage(from, '📂 *Add Category*\n\nWhat is the category name?\n\n_Type "cancel" to exit_');
            return;
        }

        if (input.startsWith('edit_category_')) {
            const pid = input.replace('edit_category_', '');
            const product = await db.product.findUnique({ where: { id: pid } });
            if (!product || product.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Product not found.');
                return;
            }

            const categories = await db.category.findMany({
                where: { merchant_id: merchant.id },
                orderBy: { name: 'asc' },
                take: 9
            });

            const rows = categories.map(cat => ({
                id: `select_cat_${pid}_${cat.id}`,
                title: cat.name.substring(0, 24),
                description: cat.description ? cat.description.substring(0, 40) : 'No description'
            }));

            rows.unshift({
                id: `select_cat_${pid}_none`,
                title: 'No Category',
                description: 'Remove category assignment'
            });

            await sendListMessage(from, `📂 *Select Category*`, '📂 Choose', [
                { title: 'Categories', rows }
            ]);
            return;
        }

        if (stateKey === STATE.CATEGORY) {
            const pid = stateParts[1];
            if (input.toLowerCase() === 'skip') {
                await setState(from, buildState(STATE.PRICE, pid));
                await sendTextMessage(from, `*Step 3/4:* What is the price?\n\n_Example: 45.50_`);
                return;
            }

            if (input.length < 2 || input.length > 40) {
                await sendTextMessage(from, '⚠️ Category name must be 2-40 characters.');
                return;
            }

            const category = await db.category.create({
                data: { name: input.trim(), merchant_id: merchant.id }
            });
            await db.product.update({ where: { id: pid }, data: { category_id: category.id } });
            await setState(from, buildState(STATE.PRICE, pid));
            await sendTextMessage(from, `✅ Category saved.\n\n*Step 3/4:* What is the price?\n\n_Example: 45.50_`);
            return;
        }

        // Step 2: Price
        if (stateKey === STATE.PRICE) {
            const pid = stateParts[1];
            const price = parseFloat(input.replace(',', '.').replace(/[^\d.]/g, ''));
            
            if (isNaN(price) || price <= 0 || price > 99999) {
                await sendTextMessage(from, '⚠️ Enter a valid price (e.g., 45.50)');
                return;
            }

            await db.product.update({ where: { id: pid }, data: { price } });
            await setState(from, buildState(STATE.IMAGE, pid));
            await sendButtons(from, `💰 R${price.toFixed(2)}\n\n*Step 4/4:* Send a photo of the item.`, [
                { id: 'skip_image', title: '⏭️ Skip' }
            ]);
            return;
        }

        // Step 3: Image
        if (stateKey === STATE.IMAGE) {
            const pid = stateParts[1];
            let imageUrl: string | null = null;

            if (message?.type === 'image' && message?.image?.id) {
                imageUrl = message.image.id;
            } else if (input === 'skip_image') {
                imageUrl = null;
            } else {
                await sendButtons(from, '⚠️ Send an image or skip.', [{ id: 'skip_image', title: '⏭️ Skip' }]);
                return;
            }

            const product = await db.product.update({
                where: { id: pid },
                data: { image_url: imageUrl },
                include: { category: true }
            });
            await setState(from, buildState(STATE.PREVIEW, pid));

            await sendButtons(from, 
                `🔍 *Review*\n\n📦 ${product.name}\n💰 R${product.price.toFixed(2)}\n${product.category ? `📂 ${product.category.name}\n` : ''}${imageUrl ? '📸 Image added' : '📷 No image'}\n\nPublish?`,
                [
                    { id: `conf_live_${pid}`, title: '🚀 Make Live' },
                    { id: `delete_prod_${pid}`, title: '❌ Cancel' }
                ]
            );
            return;
        }

        // Finalize
        if (input.startsWith('conf_live_')) {
            const pid = input.replace('conf_live_', '');
            const updated = await db.product.update({ where: { id: pid }, data: { is_in_stock: true, status: 'ACTIVE' } });
            await logAudit({
                actorWaId: from,
                action: 'PRODUCT_CREATED',
                entityType: 'PRODUCT',
                entityId: updated.id,
                metadata: { name: updated.name, price: updated.price, image_url: updated.image_url }
            });
            await clearState(from);
            await sendTextMessage(from, '🎉 Product is now live!');
            await handleInventoryActions(from, 'm_inventory', session, merchant);
            return;
        }

        if (stateKey === STATE.CAT_NAME) {
            const productId = stateParts[1];
            if (input.length < 2 || input.length > 40) {
                await sendTextMessage(from, '⚠️ Category name must be 2-40 characters.');
                return;
            }
            const category = await db.category.create({
                data: { name: input.trim(), merchant_id: merchant.id }
            });
            await setState(from, buildState(STATE.CAT_DESC, category.id, productId || ''));
            await sendTextMessage(from, '📝 Add a description? Type it now or reply "skip".');
            return;
        }

        if (stateKey === STATE.CAT_DESC) {
            const categoryId = stateParts[1];
            const productId = stateParts[2];
            const description = input.toLowerCase() === 'skip' ? null : input.trim();
            await db.category.update({ where: { id: categoryId }, data: { description } });
            await clearState(from);

            if (productId) {
                await db.product.update({ where: { id: productId }, data: { category_id: categoryId } });
                await setState(from, buildState(STATE.PRICE, productId));
                await sendTextMessage(from, `✅ Category saved.\n\n*Step 3/4:* What is the price?\n\n_Example: 45.50_`);
                return;
            }

            await sendTextMessage(from, '✅ Category saved.');
            await handleInventoryActions(from, 'm_categories', session, merchant);
            return;
        }

        if (input.startsWith('edit_cat_')) {
            const cid = input.replace('edit_cat_', '');
            const category = await db.category.findUnique({ where: { id: cid } });
            if (!category || category.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Category not found.');
                return;
            }
            await sendButtons(from, `📂 *${category.name}*\n\n${category.description || 'No description'}`, [
                { id: `cat_field_${category.id}_name`, title: '✏️ Name' },
                { id: `cat_field_${category.id}_desc`, title: '📝 Description' }
            ]);
            await sendButtons(from, 'More:', [
                { id: `cat_delete_${category.id}`, title: '🗑️ Delete' },
                { id: 'm_categories', title: '⬅️ Back' }
            ]);
            return;
        }

        if (input.startsWith('cat_field_')) {
            const [, , cid, field] = input.split('_');
            const category = await db.category.findUnique({ where: { id: cid } });
            if (!category || category.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Category not found.');
                return;
            }
            await setState(from, buildState(STATE.EDIT_CATEGORY, cid, field));
            await sendTextMessage(from, `✏️ Enter new ${field === 'desc' ? 'description' : 'name'} (or "clear" to remove description).`);
            return;
        }

        if (stateKey === STATE.EDIT_CATEGORY) {
            const categoryId = stateParts[1];
            const field = stateParts[2];
            const category = await db.category.findUnique({ where: { id: categoryId } });
            if (!category || category.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Category not found.');
                await clearState(from);
                return;
            }
            if (field === 'name') {
                if (input.length < 2 || input.length > 40) {
                    await sendTextMessage(from, '⚠️ Category name must be 2-40 characters.');
                    return;
                }
                await db.category.update({ where: { id: categoryId }, data: { name: input.trim() } });
            } else {
                const description = input.toLowerCase() === 'clear' ? null : input.trim();
                await db.category.update({ where: { id: categoryId }, data: { description } });
            }
            await clearState(from);
            await handleInventoryActions(from, `edit_cat_${categoryId}`, session, merchant);
            return;
        }

        if (input.startsWith('cat_delete_')) {
            const cid = input.replace('cat_delete_', '');
            const category = await db.category.findUnique({ where: { id: cid } });
            if (!category || category.merchant_id !== merchant.id) {
                await sendTextMessage(from, '❌ Category not found.');
                return;
            }
            await db.product.updateMany({ where: { category_id: cid }, data: { category_id: null } });
            await db.category.delete({ where: { id: cid } });
            await sendTextMessage(from, '🗑️ Category deleted.');
            await handleInventoryActions(from, 'm_categories', session, merchant);
            return;
        }

        if (stateKey === STATE.VAR_SIZE) {
            const pid = stateParts[1];
            const data = await getSessionData(from);
            const size = input.toLowerCase() === 'skip' ? null : input.trim();
            await setSessionData(from, { variantDraft: { ...(data?.variantDraft || {}), productId: pid, size } });
            await setState(from, buildState(STATE.VAR_COLOR, pid));
            await sendTextMessage(from, 'Step 2/4: Enter color (or type "skip").');
            return;
        }

        if (stateKey === STATE.VAR_COLOR) {
            const pid = stateParts[1];
            const data = await getSessionData(from);
            const color = input.toLowerCase() === 'skip' ? null : input.trim();
            await setSessionData(from, { variantDraft: { ...(data?.variantDraft || {}), productId: pid, color } });
            await setState(from, buildState(STATE.VAR_SKU, pid));
            await sendTextMessage(from, 'Step 3/4: Enter SKU (or type "skip").');
            return;
        }

        if (stateKey === STATE.VAR_SKU) {
            const pid = stateParts[1];
            const data = await getSessionData(from);
            const sku = input.toLowerCase() === 'skip' ? null : input.trim();
            await setSessionData(from, { variantDraft: { ...(data?.variantDraft || {}), productId: pid, sku } });
            await setState(from, buildState(STATE.VAR_PRICE, pid));
            await sendTextMessage(from, 'Step 4/4: Enter variant price (e.g., 45.50).');
            return;
        }

        if (stateKey === STATE.VAR_PRICE) {
            const pid = stateParts[1];
            const price = parseFloat(input.replace(',', '.').replace(/[^\d.]/g, ''));
            if (isNaN(price) || price <= 0 || price > 99999) {
                await sendTextMessage(from, '⚠️ Enter a valid price (e.g., 45.50)');
                return;
            }
            const data = await getSessionData(from);
            const draft = data?.variantDraft || {};
            await db.productVariant.create({
                data: {
                    product_id: pid,
                    size: draft.size || null,
                    color: draft.color || null,
                    sku: draft.sku || null,
                    price
                }
            });
            await setSessionData(from, null);
            await clearState(from);
            await sendTextMessage(from, '✅ Variant added.');
            await handleInventoryActions(from, `view_variants_${pid}`, session, merchant);
            return;
        }

        // Fallback
        if (state) {
            await sendTextMessage(from, '⚠️ Please follow the prompts or type *cancel*.');
            return;
        }

    } catch (error: any) {
        console.error(`❌ Inventory Error: ${error.message}`);
        await clearState(from);
        await sendTextMessage(from, '❌ Error occurred.');
    }
};

const setState = async (from: string, state: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: state } });
};

const clearState = async (from: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
};

const setSessionData = async (from: string, data: Record<string, any> | null) => {
    await db.userSession.update({
        where: { wa_id: from },
        data: { state: data ? JSON.stringify(data) : null }
    });
};

const getSessionData = async (from: string): Promise<Record<string, any> | null> => {
    const current = await db.userSession.findUnique({ where: { wa_id: from }, select: { state: true } });
    if (!current?.state) return null;
    try {
        return JSON.parse(current.state);
    } catch {
        return null;
    }
};
