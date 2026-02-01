import { PrismaClient, OrderStatus, Mode } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();
const OMERU_FEE = 0.07;

export const handleMerchantAction = async (from: string, input: string, session: any, merchant: any, message?: any) => {
    
    // --- 1. KITCHEN VIEW (Order Management) ---
    if (input === 'm_kitchen') {
        const orders = await db.order.findMany({
            where: { 
                merchant_id: merchant.id, 
                status: { in: [OrderStatus.PAID, OrderStatus.READY_FOR_PICKUP] } 
            },
            orderBy: { createdAt: 'asc' }
        });

        if (orders.length === 0) return sendTextMessage(from, "🍳 *Kitchen is clear!* No pending orders right now.");

        for (const o of orders) {
            const label = o.status === OrderStatus.PAID ? "🔥 *NEW ORDER*" : "✅ *READY*";
            const btnTitle = o.status === OrderStatus.PAID ? "Mark Ready" : "Mark Collected";
            const btnId = o.status === OrderStatus.PAID ? `ready_${o.id}` : `collected_${o.id}`;

            await sendButtons(from, `${label}\n#${o.id.slice(-5)}\n💰 R${o.amount}\n📝 ${o.items_summary}`, [
                { id: btnId, title: btnTitle }
            ]);
        }
        return;
    }

    // FULFILLMENT ACTIONS
    if (input.startsWith('ready_')) {
        const oid = input.replace('ready_', '');
        const order = await db.order.update({ 
            where: { id: oid }, 
            data: { status: OrderStatus.READY_FOR_PICKUP } 
        });
        // Notify Customer
        await sendTextMessage(order.customer_id, `🛍️ *Order Ready!* Your order from *${merchant.trading_name}* is ready for collection.`);
        return sendTextMessage(from, "✅ Order marked as ready. Customer has been notified.");
    }

    if (input.startsWith('collected_')) {
        const oid = input.replace('collected_', '');
        await db.order.update({ 
            where: { id: oid }, 
            data: { status: OrderStatus.COMPLETED } 
        });
        return sendTextMessage(from, "🏁 Order completed. Funds will be included in your Friday payout.");
    }

    // --- 2. OPERATING HOURS MANAGEMENT ---
    if (input === 'm_edit_hours') {
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: 'EDIT_HOURS' } });
        return sendTextMessage(from, `⏰ *Current Hours:* ${merchant.open_time} - ${merchant.close_time}\n\nPlease enter new hours in 24h format:\n*HH:MM - HH:MM* (e.g. 09:00 - 20:00)`);
    }

    if (session.active_prod_id === 'EDIT_HOURS') {
        const hoursRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?-\s?([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!hoursRegex.test(input)) return sendTextMessage(from, "❌ Invalid format. Use *HH:MM - HH:MM*");
        
        const [open, close] = input.split('-').map(s => s.trim());
        await db.merchant.update({ where: { id: merchant.id }, data: { open_time: open, close_time: close } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        return sendTextMessage(from, "✅ Operating hours updated successfully!");
    }

    // --- 3. PRODUCT CREATION FLOW (With Preview) ---
    if (input === 'm_add_prod') {
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: 'NAME_PENDING' } });
        return sendTextMessage(from, "🛍️ *New Product Step 1:* What is the **Name**?");
    }

    if (session.active_prod_id === 'NAME_PENDING') {
        const prod = await db.product.create({ data: { name: input, price: 0, merchant_id: merchant.id, is_in_stock: false } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: prod.id } });
        return sendTextMessage(from, `💰 *Step 2:* Price for *${input}*? (Numbers only)`);
    }

    if (session.active_prod_id && !isNaN(Number(input)) && session.active_prod_id.length > 10) {
        await db.product.update({ where: { id: session.active_prod_id }, data: { price: parseFloat(input) } });
        return sendTextMessage(from, "📸 *Step 3:* Send a **Photo** of the product.");
    }

    if (session.active_prod_id && message?.type === 'image') {
        const prod = await db.product.update({ 
            where: { id: session.active_prod_id }, 
            data: { image_url: message.image.id } 
        });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: `PREVIEW_${prod.id}` } });
        
        const previewText = `📝 *CONFIRM DETAILS*\n\n*Name:* ${prod.name}\n*Price:* R${prod.price}\n\nDoes this look correct?`;
        return sendButtons(from, previewText, [
            { id: `conf_live_${prod.id}`, title: '🚀 Make Live' },
            { id: `edit_sel_${prod.id}`, title: '✏️ Edit Instead' }
        ]);
    }

    if (input.startsWith('conf_live_')) {
        const pid = input.replace('conf_live_', '');
        await db.product.update({ where: { id: pid }, data: { is_in_stock: true } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        return sendTextMessage(from, "✅ Product is now LIVE in your shop!");
    }

    // --- 4. THE EDIT/DELETE ENGINE ---
    if (input === 'm_edit_menu') {
        const products = await db.product.findMany({ where: { merchant_id: merchant.id } });
        if (products.length === 0) return sendTextMessage(from, "No products to edit.");
        
        for (const p of products) {
            await sendButtons(from, `✏️ Edit: *${p.name}* (R${p.price})`, [
                { id: `edit_sel_${p.id}`, title: 'Select Product' }
            ]);
        }
        return;
    }

    if (input.startsWith('edit_sel_')) {
        const pid = input.replace('edit_sel_', '');
        const p = await db.product.findUnique({ where: { id: pid } });
        return sendButtons(from, `🛠️ *Managing: ${p?.name}*\nWhat would you like to change?`, [
            { id: `edit_name_${pid}`, title: 'Change Name' },
            { id: `edit_price_${pid}`, title: 'Change Price' },
            { id: `delete_prod_${pid}`, title: '🗑️ Delete' }
        ]);
    }

    if (input.startsWith('edit_name_')) {
        const pid = input.replace('edit_name_', '');
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: `RENAME_${pid}` } });
        return sendTextMessage(from, "✏️ Enter the **New Name**:");
    }

    if (session.active_prod_id?.startsWith('RENAME_') && !input.startsWith('edit_')) {
        const pid = session.active_prod_id.replace('RENAME_', '');
        await db.product.update({ where: { id: pid }, data: { name: input } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        return sendTextMessage(from, "✅ Name updated!");
    }

    if (input.startsWith('edit_price_')) {
        const pid = input.replace('edit_price_', '');
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: `REPRICE_${pid}` } });
        return sendTextMessage(from, "💰 Enter the **New Price**:");
    }

    if (session.active_prod_id?.startsWith('REPRICE_') && !isNaN(Number(input))) {
        const pid = session.active_prod_id.replace('REPRICE_', '');
        await db.product.update({ where: { id: pid }, data: { price: parseFloat(input) } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        return sendTextMessage(from, "✅ Price updated!");
    }

    if (input.startsWith('delete_prod_')) {
        const pid = input.replace('delete_prod_', '');
        await db.product.delete({ where: { id: pid } });
        return sendTextMessage(from, "🗑️ Product deleted successfully.");
    }

    // --- 5. INVENTORY & DEBUG ---
    if (input === 'm_inventory') {
        const products = await db.product.findMany({ where: { merchant_id: merchant.id } });
        for (const p of products) {
            await sendButtons(from, `📦 *${p.name}*\nR${p.price}\nStatus: ${p.is_in_stock ? 'Live' : 'Hidden'}`, [
                { id: `toggle_${p.id}`, title: p.is_in_stock ? 'Set Out of Stock' : 'Set In Stock' }
            ]);
        }
        return;
    }

    if (input.startsWith('toggle_')) {
        const pid = input.replace('toggle_', '');
        const p = await db.product.findUnique({ where: { id: pid } });
        await db.product.update({ where: { id: pid }, data: { is_in_stock: !p?.is_in_stock } });
        return sendTextMessage(from, "🔄 Stock status updated.");
    }

    // CREATE DUMMY ORDER (DEBUG ONLY)
    if (input === 'debug_dummy') {
        await db.order.create({
            data: {
                merchant_id: merchant.id,
                customer_id: from, // Sending it to yourself
                amount: 45.00,
                status: OrderStatus.PAID,
                items_summary: "1x Deluxe Burger, 1x Large Fries",
                is_payout_set: false
            }
        });
        return sendTextMessage(from, "🪄 Dummy Order Created! Click 'Kitchen View' to see it.");
    }

    return showMerchantDashboard(from, merchant);
};

export const showMerchantDashboard = async (to: string, merchant: any) => {
    return sendButtons(to, `🏪 *${merchant.trading_name}*\n⏰ ${merchant.open_time} - ${merchant.close_time}`, [
        { id: 'm_kitchen', title: '🍳 Kitchen View' },
        { id: 'm_edit_menu', title: '✏️ Edit Items' },
        { id: 'm_edit_hours', title: '⏰ Set Hours' }
    ]);
};