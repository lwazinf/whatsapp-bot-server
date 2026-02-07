import { PrismaClient, Merchant, UserSession } from '@prisma/client';
import { sendTextMessage, sendButtons, sendListMessage } from './sender';
import { formatCurrency } from './formatters';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

const STATE = {
    NAME: 'ADD_NAME',
    PRICE: 'ADD_PRICE_',
    IMAGE: 'ADD_IMG_',
    PREVIEW: 'ADD_PREVIEW_',
    DELETE: 'DEL_'
};

export const handleInventoryActions = async (
    from: string, 
    input: string, 
    session: UserSession, 
    merchant: Merchant, 
    message?: any
): Promise<void> => {
    try {
        const state = session.active_prod_id || '';

        // Menu
        if (input === 'm_inventory' || input === 'p_back') {
            await clearState(from);
            const count = await db.product.count({ where: { merchant_id: merchant.id, status: 'ACTIVE' } });
            await sendButtons(from, `📦 *Menu Manager*\n\n${count} active items`, [
                { id: 'm_add_prod', title: '➕ Add Item' },
                { id: 'p_view_all', title: '👀 View Menu' },
                { id: 'm_dashboard', title: '🏠 Dashboard' }
            ]);
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
                description: `${formatCurrency(p.price, merchant)} • ${p.is_in_stock ? '🟢' : '🔴'}`
            }));

            await sendListMessage(from, `📦 *Your Menu* (${products.length} items)`, '📋 View Items', [{ title: 'Products', rows }]);
            await sendButtons(from, 'Actions:', [{ id: 'm_add_prod', title: '➕ Add Item' }, { id: 'p_back', title: '⬅️ Back' }]);
            return;
        }

        // Edit product
        if (input.startsWith('edit_prod_')) {
            const pid = input.replace('edit_prod_', '');
            const p = await db.product.findUnique({ where: { id: pid } });
            if (!p) { await sendTextMessage(from, '❌ Product not found.'); return; }

            await sendButtons(from, `📦 *${p.name}*\n\n${formatCurrency(p.price, merchant)}\n${p.is_in_stock ? '🟢 In Stock' : '🔴 Out of Stock'}`, [
                { id: `toggle_${p.id}`, title: p.is_in_stock ? '🔴 Out of Stock' : '🟢 In Stock' },
                { id: `delete_prod_${p.id}`, title: '🗑️ Delete' }
            ]);
            await sendButtons(from, 'Nav:', [{ id: 'p_view_all', title: '⬅️ Back' }]);
            return;
        }

        // Toggle stock
        if (input.startsWith('toggle_')) {
            const pid = input.replace('toggle_', '');
            const p = await db.product.findUnique({ where: { id: pid } });
            if (!p || p.merchant_id !== merchant.id) { await sendTextMessage(from, '❌ Not found.'); return; }
            
            const updated = await db.product.update({ where: { id: pid }, data: { is_in_stock: !p.is_in_stock } });
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

        if (input.toLowerCase() === 'cancel' && state.startsWith('ADD_')) {
            // Cleanup draft
            if (state.startsWith(STATE.PRICE) || state.startsWith(STATE.IMAGE) || state.startsWith(STATE.PREVIEW)) {
                const pid = state.replace(STATE.PRICE, '').replace(STATE.IMAGE, '').replace(STATE.PREVIEW, '');
                try { await db.product.delete({ where: { id: pid } }); } catch {}
            }
            await clearState(from);
            await sendTextMessage(from, '❌ Cancelled.');
            await handleInventoryActions(from, 'm_inventory', session, merchant);
            return;
        }

        // Step 1: Name
        if (state === STATE.NAME) {
            if (input.length < 2 || input.length > 50) {
                await sendTextMessage(from, '⚠️ Name must be 2-50 characters.');
                return;
            }
            const product = await db.product.create({
                data: { name: input.trim(), price: 0, merchant_id: merchant.id, is_in_stock: false, status: 'DRAFT' }
            });
            await setState(from, `${STATE.PRICE}${product.id}`);
            await sendTextMessage(from, `✅ *${input}*\n\n*Step 2/3:* What is the price?\n\n_Example: 45.50_`);
            return;
        }

        // Step 2: Price
        if (state.startsWith(STATE.PRICE)) {
            const pid = state.replace(STATE.PRICE, '');
            const price = parseFloat(input.replace(',', '.').replace(/[^\d.]/g, ''));
            
            if (isNaN(price) || price <= 0 || price > 99999) {
                await sendTextMessage(from, '⚠️ Enter a valid price (e.g., 45.50)');
                return;
            }

            await db.product.update({ where: { id: pid }, data: { price } });
            await setState(from, `${STATE.IMAGE}${pid}`);
            await sendButtons(from, `💰 ${formatCurrency(price, merchant)}\n\n*Step 3/3:* Send a photo of the item.`, [
                { id: 'skip_image', title: '⏭️ Skip' }
            ]);
            return;
        }

        // Step 3: Image
        if (state.startsWith(STATE.IMAGE)) {
            const pid = state.replace(STATE.IMAGE, '');
            let imageUrl: string | null = null;

            if (message?.type === 'image' && message?.image?.id) {
                imageUrl = message.image.id;
            } else if (input === 'skip_image') {
                imageUrl = null;
            } else {
                await sendButtons(from, '⚠️ Send an image or skip.', [{ id: 'skip_image', title: '⏭️ Skip' }]);
                return;
            }

            const product = await db.product.update({ where: { id: pid }, data: { image_url: imageUrl } });
            await setState(from, `${STATE.PREVIEW}${pid}`);

            await sendButtons(from, 
                `🔍 *Review*\n\n📦 ${product.name}\n💰 ${formatCurrency(product.price, merchant)}\n${imageUrl ? '📸 Image added' : '📷 No image'}\n\nPublish?`,
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
            await db.product.update({ where: { id: pid }, data: { is_in_stock: true, status: 'ACTIVE' } });
            await clearState(from);
            await sendTextMessage(from, '🎉 Product is now live!');
            await handleInventoryActions(from, 'm_inventory', session, merchant);
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
