import { PrismaClient, OrderStatus, Mode } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();

/**
 * Enhanced Utility: Checks day-specific hours from the DB
 */
export const isMerchantOpen = (merchant: any): boolean => {
    const now = new Date();
    const localTime = new Date(now.getTime() + (2 * 60 * 60 * 1000));
    const day = localTime.getUTCDay(); 
    const time = localTime.getUTCHours().toString().padStart(2, '0') + ":" + 
                 localTime.getUTCMinutes().toString().padStart(2, '0');

    if (day === 0) return merchant.sun_open; // Uses DB preference for Sunday

    if (day === 6) {
        return time >= merchant.sat_open_time && time <= merchant.sat_close_time;
    }

    // Mon-Fri
    return time >= merchant.open_time && time <= merchant.close_time;
};

export const handleMerchantAction = async (from: string, input: string, session: any, merchant: any, message?: any) => {
    
    // --- 1. KITCHEN VIEW ---
    if (input === 'm_kitchen') {
        const orders = await db.order.findMany({
            where: { 
                merchant_id: merchant.id, 
                status: { in: [OrderStatus.PAID, OrderStatus.READY_FOR_PICKUP] } 
            },
            orderBy: { createdAt: 'asc' }
        });

        if (orders.length === 0) return sendTextMessage(from, "🍳 *Kitchen is clear!* No pending orders.");

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
        const order = await db.order.update({ where: { id: oid }, data: { status: OrderStatus.READY_FOR_PICKUP } });
        await sendTextMessage(order.customer_id, `🛍️ *Order Ready!* Your order from *${merchant.trading_name}* is ready.`);
        await sendTextMessage(from, "✅ Customer notified.");
        return showMerchantDashboard(from, merchant); // UX: Back to menu
    }

    if (input.startsWith('collected_')) {
        const oid = input.replace('collected_', '');
        await db.order.update({ where: { id: oid }, data: { status: OrderStatus.COMPLETED } });
        await sendTextMessage(from, "🏁 Order completed.");
        return showMerchantDashboard(from, merchant); // UX: Back to menu
    }

    // --- 2. OPERATING HOURS ---
    if (input === 'm_edit_hours' || input === 'h_cancel') {
        const currentHours = `⏰ *Trading Hours Settings*\n\n` +
                             `📅 Mon-Fri: ${merchant.open_time} - ${merchant.close_time}\n` +
                             `📅 Sat: ${merchant.sat_open_time} - ${merchant.sat_close_time}\n` +
                             `🚫 Sun: ${merchant.sun_open ? 'OPEN' : 'CLOSED'}`;
        
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        return sendButtons(from, currentHours, [
            { id: 'h_set_default', title: '✅ Use Standard' },
            { id: 'h_custom_menu', title: '✏️ Custom Hours' }
        ]);
    }

    if (input === 'h_set_default') {
        const updated = await db.merchant.update({
            where: { id: merchant.id },
            data: { 
                open_time: "09:00", close_time: "17:00",
                sat_open_time: "10:00", sat_close_time: "15:00",
                sun_open: false
            }
        });
        await sendTextMessage(from, "✅ *Standard Hours Applied.*");
        return showMerchantDashboard(from, updated);
    }

    if (input === 'h_custom_menu') {
        // Sending the first 3 options
        await sendButtons(from, "Select day to edit:", [
            { id: 'h_custom_mf', title: '📅 Mon - Fri' },
            { id: 'h_custom_sat', title: '📅 Sat' },
            { id: 'h_custom_sun', title: '📅 Sun' }
        ]);
        // Sending the cancel/back option separately to bypass the 3-button limit
        return sendButtons(from, "Or go back:", [
            { id: 'h_cancel', title: '❌ Cancel' }
        ]);
    }

    if (input === 'h_custom_sun') {
        const updated = await db.merchant.update({
            where: { id: merchant.id },
            data: { sun_open: !merchant.sun_open }
        });
        await sendTextMessage(from, `📅 Sunday is now: *${updated.sun_open ? 'OPEN' : 'CLOSED'}*`);
        return showMerchantDashboard(from, updated);
    }

    if (input === 'h_custom_mf' || input === 'h_custom_sat') {
        const dayLabel = input.includes('mf') ? 'Weekday' : 'Saturday';
        await db.userSession.update({ 
            where: { wa_id: from }, 
            data: { active_prod_id: `HOURS_${dayLabel.toUpperCase()}` } 
        });
        return sendTextMessage(from, `✏️ Enter hours for *${dayLabel}* (24h format):\n*HH:MM - HH:MM*`);
    }

    if (session.active_prod_id?.startsWith('HOURS_')) {
        const hoursRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?-\s?([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!hoursRegex.test(input)) return sendTextMessage(from, "❌ Format: *HH:MM - HH:MM*");
        
        const [open, close] = input.split('-').map(s => s.trim());
        const isSat = session.active_prod_id.includes('SATURDAY');
        
        const updated = await db.merchant.update({ 
            where: { id: merchant.id }, 
            data: isSat ? { sat_open_time: open, sat_close_time: close } : { open_time: open, close_time: close }
        });

        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        await sendTextMessage(from, `✅ ${isSat ? 'Saturday' : 'Weekday'} hours updated!`);
        return showMerchantDashboard(from, updated);
    }

    // --- 3. PRODUCT CREATION ---
    if (input === 'm_add_prod') {
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: 'NAME_PENDING' } });
        return sendTextMessage(from, "🛍️ *New Product:* What is the **Name**?");
    }

    if (session.active_prod_id === 'NAME_PENDING') {
        const prod = await db.product.create({ data: { name: input, price: 0, merchant_id: merchant.id, is_in_stock: false } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: prod.id } });
        return sendTextMessage(from, `💰 Price for *${input}*?`);
    }

    if (session.active_prod_id && !isNaN(Number(input)) && session.active_prod_id.length > 10) {
        await db.product.update({ where: { id: session.active_prod_id }, data: { price: parseFloat(input) } });
        return sendTextMessage(from, "📸 Send a **Photo**.");
    }

    if (session.active_prod_id && message?.type === 'image') {
        const prod = await db.product.update({ where: { id: session.active_prod_id }, data: { image_url: message.image.id } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: `PREVIEW_${prod.id}` } });
        return sendButtons(from, `📝 *Confirm Details*\nName: ${prod.name}\nPrice: R${prod.price}`, [
            { id: `conf_live_${prod.id}`, title: '🚀 Make Live' },
            { id: `delete_prod_${prod.id}`, title: '🗑️ Cancel' }
        ]);
    }

    if (input.startsWith('conf_live_')) {
        const pid = input.replace('conf_live_', '');
        await db.product.update({ where: { id: pid }, data: { is_in_stock: true } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        await sendTextMessage(from, "✅ Product is now LIVE!");
        return showMerchantDashboard(from, merchant);
    }

    // --- 4. EDIT/DELETE ---
    if (input === 'm_edit_menu') {
        const products = await db.product.findMany({ where: { merchant_id: merchant.id } });
        if (products.length === 0) return sendTextMessage(from, "No products.");
        for (const p of products) {
            await sendButtons(from, `✏️ Edit: *${p.name}*`, [{ id: `edit_sel_${p.id}`, title: 'Select' }]);
        }
        return;
    }

    if (input.startsWith('edit_sel_')) {
        const pid = input.replace('edit_sel_', '');
        return sendButtons(from, `🛠️ Managing Product`, [
            { id: `edit_name_${pid}`, title: 'Name' },
            { id: `edit_price_${pid}`, title: 'Price' },
            { id: `delete_prod_${pid}`, title: '🗑️ Delete' }
        ]);
    }

    if (input.startsWith('delete_prod_')) {
        const pid = input.replace('delete_prod_', '');
        await db.product.delete({ where: { id: pid } });
        await sendTextMessage(from, "🗑️ Deleted.");
        return showMerchantDashboard(from, merchant);
    }

    // --- 5. INVENTORY ---
    if (input === 'm_inventory') {
        const products = await db.product.findMany({ where: { merchant_id: merchant.id } });
        for (const p of products) {
            await sendButtons(from, `📦 *${p.name}* (${p.is_in_stock ? 'Live' : 'Hidden'})`, [
                { id: `toggle_${p.id}`, title: p.is_in_stock ? 'Set Out Stock' : 'Set In Stock' }
            ]);
        }
        return;
    }

    if (input.startsWith('toggle_')) {
        const pid = input.replace('toggle_', '');
        const p = await db.product.findUnique({ where: { id: pid } });
        await db.product.update({ where: { id: pid }, data: { is_in_stock: !p?.is_in_stock } });
        await sendTextMessage(from, "🔄 Stock updated.");
        return showMerchantDashboard(from, merchant);
    }

    return showMerchantDashboard(from, merchant);
};

export const showMerchantDashboard = async (to: string, merchant: any) => {
    const status = isMerchantOpen(merchant) ? "🟢 OPEN" : "🔴 CLOSED";
    const hoursStr = `⏰ Mon-Fri: ${merchant.open_time}-${merchant.close_time}\n⏰ Sat: ${merchant.sat_open_time}-${merchant.sat_close_time}`;
    
    return sendButtons(to, `🏪 *${merchant.trading_name}*\nStatus: ${status}\n${hoursStr}`, [
        { id: 'm_kitchen', title: '🍳 Kitchen View' },
        { id: 'm_edit_menu', title: '✏️ Edit Items' },
        { id: 'm_edit_hours', title: '⏰ Set Hours' }
    ]);
};