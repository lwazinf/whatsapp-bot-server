import { PrismaClient, OrderStatus, Mode } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();

/**
 * Utility to check if a merchant is currently open based on strict rules:
 * Mon-Fri: 09:00 - 17:00
 * Sat: 10:00 - 15:00
 * Sun: CLOSED
 */
export const isMerchantOpen = (merchant: any): boolean => {
    const now = new Date();
    // Adjust for South African Time (SAST is UTC+2)
    const localTime = new Date(now.getTime() + (2 * 60 * 60 * 1000));
    const day = localTime.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const time = localTime.getUTCHours().toString().padStart(2, '0') + ":" + 
                 localTime.getUTCMinutes().toString().padStart(2, '0');

    if (day === 0) return false; // Sunday is always closed

    const open = merchant.open_time;
    const close = merchant.close_time;

    // Check specific Saturday rules if they are using defaults
    if (day === 6 && open === "09:00") {
        return time >= "10:00" && time <= "15:00";
    }

    return time >= open && time <= close;
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

    // FULFILLMENT
    if (input.startsWith('ready_')) {
        const oid = input.replace('ready_', '');
        const order = await db.order.update({ where: { id: oid }, data: { status: OrderStatus.READY_FOR_PICKUP } });
        await sendTextMessage(order.customer_id, `🛍️ *Order Ready!* Your order from *${merchant.trading_name}* is ready.`);
        return sendTextMessage(from, "✅ Customer notified.");
    }

    if (input.startsWith('collected_')) {
        const oid = input.replace('collected_', '');
        await db.order.update({ where: { id: oid }, data: { status: OrderStatus.COMPLETED } });
        return sendTextMessage(from, "🏁 Order completed.");
    }

    // --- 2. OPERATING HOURS (Strict Rules) ---
    if (input === 'm_edit_hours') {
        const currentHours = `⏰ *Current Trading Hours:*\n\n` +
                             `📅 Mon-Fri: 09:00 - 17:00\n` +
                             `📅 Sat: 10:00 - 15:00\n` +
                             `🚫 Sun: CLOSED\n\n` +
                             `Your current setting: *${merchant.open_time} - ${merchant.close_time}*`;
        
        return sendButtons(from, currentHours, [
            { id: 'h_set_default', title: '✅ Use Standard' },
            { id: 'h_set_custom', title: '✏️ Enter Custom' }
        ]);
    }

    if (input === 'h_set_default') {
        await db.merchant.update({
            where: { id: merchant.id },
            data: { open_time: "09:00", close_time: "17:00" }
        });
        return sendTextMessage(from, "✅ *Standard Hours Applied:*\nMon-Fri: 09:00-17:00\nSat: 10:00-15:00\nSun: Closed");
    }

    if (input === 'h_set_custom') {
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: 'EDIT_HOURS' } });
        return sendTextMessage(from, "Please enter custom hours (24h format):\n*HH:MM - HH:MM*");
    }

    if (session.active_prod_id === 'EDIT_HOURS') {
        const hoursRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?-\s?([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!hoursRegex.test(input)) return sendTextMessage(from, "❌ Format: *HH:MM - HH:MM*");
        
        const [open, close] = input.split('-').map(s => s.trim());
        await db.merchant.update({ where: { id: merchant.id }, data: { open_time: open, close_time: close } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        return sendTextMessage(from, `✅ Custom hours set: *${open} - ${close}*`);
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
        return sendTextMessage(from, "✅ Product is now LIVE!");
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
        return sendTextMessage(from, "🗑️ Deleted.");
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
        return sendTextMessage(from, "🔄 Stock updated.");
    }

    return showMerchantDashboard(from, merchant);
};

export const showMerchantDashboard = async (to: string, merchant: any) => {
    const status = isMerchantOpen(merchant) ? "🟢 OPEN" : "🔴 CLOSED";
    return sendButtons(to, `🏪 *${merchant.trading_name}*\nStatus: ${status}\n⏰ ${merchant.open_time} - ${merchant.close_time}`, [
        { id: 'm_kitchen', title: '🍳 Kitchen View' },
        { id: 'm_edit_menu', title: '✏️ Edit Items' },
        { id: 'm_edit_hours', title: '⏰ Set Hours' }
    ]);
};