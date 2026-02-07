import { PrismaClient, Merchant, UserSession } from '@prisma/client';
import { sendTextMessage, sendButtons, sendListMessage } from './sender';
import {
    actionsLabel,
    addItemCancelledMessage,
    addItemLabel,
    addItemStartMessage,
    backLabel,
    cancelDeleteLabel,
    cancelProductLabel,
    confirmDeleteLabel,
    confirmLiveFallbackMessage,
    dashboardHomeLabel,
    deleteConfirmMessage,
    deleteLabel,
    followPromptsMessage,
    imagePromptMessage,
    inStockLabel,
    inventoryErrorMessage,
    inventoryMenuMessage,
    menuEmptyMessage,
    menuItemRowDescription,
    menuListTitle,
    navLabel,
    outOfStockLabel,
    priceInvalidMessage,
    priceSavedMessage,
    productDeletedMessage,
    productDetailsMessage,
    productLiveMessage,
    productNameInvalidMessage,
    productNameSavedMessage,
    productNotFoundMessage,
    productStatusMessage,
    publishLabel,
    productsSectionTitle,
    reviewMessage,
    skipImageLabel,
    viewItemsLabel,
    viewMenuLabel
} from './templates';

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
            await sendButtons(from, inventoryMenuMessage(count), [
                { id: 'm_add_prod', title: addItemLabel() },
                { id: 'p_view_all', title: viewMenuLabel() },
                { id: 'm_dashboard', title: dashboardHomeLabel() }
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
                await sendTextMessage(from, menuEmptyMessage());
                await handleInventoryActions(from, 'm_inventory', session, merchant);
                return;
            }

            const rows = products.map(p => ({
                id: `edit_prod_${p.id}`,
                title: p.name.substring(0, 24),
                description: menuItemRowDescription(p.price, p.is_in_stock)
            }));

            await sendListMessage(from, menuListTitle(products.length), viewItemsLabel(), [
                { title: productsSectionTitle(), rows }
            ]);
            await sendButtons(from, actionsLabel(), [{ id: 'm_add_prod', title: addItemLabel() }, { id: 'p_back', title: backLabel() }]);
            return;
        }

        // Edit product
        if (input.startsWith('edit_prod_')) {
            const pid = input.replace('edit_prod_', '');
            const p = await db.product.findUnique({ where: { id: pid } });
            if (!p) { await sendTextMessage(from, productNotFoundMessage()); return; }

            await sendButtons(from, productDetailsMessage(p.name, p.price, p.is_in_stock), [
                { id: `toggle_${p.id}`, title: p.is_in_stock ? outOfStockLabel() : inStockLabel() },
                { id: `delete_prod_${p.id}`, title: deleteLabel() }
            ]);
            await sendButtons(from, navLabel(), [{ id: 'p_view_all', title: backLabel() }]);
            return;
        }

        // Toggle stock
        if (input.startsWith('toggle_')) {
            const pid = input.replace('toggle_', '');
            const p = await db.product.findUnique({ where: { id: pid } });
            if (!p || p.merchant_id !== merchant.id) { await sendTextMessage(from, confirmLiveFallbackMessage()); return; }
            
            const updated = await db.product.update({ where: { id: pid }, data: { is_in_stock: !p.is_in_stock } });
            await sendTextMessage(from, productStatusMessage(updated.name, updated.is_in_stock));
            await handleInventoryActions(from, 'p_view_all', session, merchant);
            return;
        }

        // Delete confirmation
        if (input.startsWith('delete_prod_')) {
            const pid = input.replace('delete_prod_', '');
            const p = await db.product.findUnique({ where: { id: pid } });
            if (!p) { await sendTextMessage(from, confirmLiveFallbackMessage()); return; }
            
            await setState(from, `${STATE.DELETE}${pid}`);
            await sendButtons(from, deleteConfirmMessage(p.name), [
                { id: `confirm_del_${pid}`, title: confirmDeleteLabel() },
                { id: 'cancel_delete', title: cancelDeleteLabel() }
            ]);
            return;
        }

        if (input.startsWith('confirm_del_')) {
            const pid = input.replace('confirm_del_', '');
            const p = await db.product.findUnique({ where: { id: pid } });
            if (p && p.merchant_id === merchant.id) {
                await db.product.delete({ where: { id: pid } });
                await sendTextMessage(from, productDeletedMessage(p.name));
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
            await sendTextMessage(from, addItemStartMessage());
            return;
        }

        if (input.toLowerCase() === 'cancel' && state.startsWith('ADD_')) {
            // Cleanup draft
            if (state.startsWith(STATE.PRICE) || state.startsWith(STATE.IMAGE) || state.startsWith(STATE.PREVIEW)) {
                const pid = state.replace(STATE.PRICE, '').replace(STATE.IMAGE, '').replace(STATE.PREVIEW, '');
                try { await db.product.delete({ where: { id: pid } }); } catch {}
            }
            await clearState(from);
            await sendTextMessage(from, addItemCancelledMessage());
            await handleInventoryActions(from, 'm_inventory', session, merchant);
            return;
        }

        // Step 1: Name
        if (state === STATE.NAME) {
            if (input.length < 2 || input.length > 50) {
                await sendTextMessage(from, productNameInvalidMessage());
                return;
            }
            const product = await db.product.create({
                data: { name: input.trim(), price: 0, merchant_id: merchant.id, is_in_stock: false, status: 'DRAFT' }
            });
            await setState(from, `${STATE.PRICE}${product.id}`);
            await sendTextMessage(from, productNameSavedMessage(input.trim()));
            return;
        }

        // Step 2: Price
        if (state.startsWith(STATE.PRICE)) {
            const pid = state.replace(STATE.PRICE, '');
            const price = parseFloat(input.replace(',', '.').replace(/[^\d.]/g, ''));
            
            if (isNaN(price) || price <= 0 || price > 99999) {
                await sendTextMessage(from, priceInvalidMessage());
                return;
            }

            await db.product.update({ where: { id: pid }, data: { price } });
            await setState(from, `${STATE.IMAGE}${pid}`);
            await sendButtons(from, priceSavedMessage(price), [
                { id: 'skip_image', title: skipImageLabel() }
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
                await sendButtons(from, imagePromptMessage(), [{ id: 'skip_image', title: skipImageLabel() }]);
                return;
            }

            const product = await db.product.update({ where: { id: pid }, data: { image_url: imageUrl } });
            await setState(from, `${STATE.PREVIEW}${pid}`);

            await sendButtons(from, reviewMessage(product.name, product.price, Boolean(imageUrl)), [
                { id: `conf_live_${pid}`, title: publishLabel() },
                { id: `delete_prod_${pid}`, title: cancelProductLabel() }
            ]);
            return;
        }

        // Finalize
        if (input.startsWith('conf_live_')) {
            const pid = input.replace('conf_live_', '');
            await db.product.update({ where: { id: pid }, data: { is_in_stock: true, status: 'ACTIVE' } });
            await clearState(from);
            await sendTextMessage(from, productLiveMessage());
            await handleInventoryActions(from, 'm_inventory', session, merchant);
            return;
        }

        // Fallback
        if (state) {
            await sendTextMessage(from, followPromptsMessage());
            return;
        }

    } catch (error: any) {
        console.error(`❌ Inventory Error: ${error.message}`);
        await clearState(from);
        await sendTextMessage(from, inventoryErrorMessage());
    }
};

const setState = async (from: string, state: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: state } });
};

const clearState = async (from: string) => {
    await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
};
