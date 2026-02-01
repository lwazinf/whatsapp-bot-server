import { PrismaClient, OrderStatus, Mode } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();
const OMERU_FEE = 0.07;

/**
 * The core engine for all ACTIVE merchant business logic.
 */
export const handleMerchantAction = async (from: string, input: string, session: any, merchant: any, message?: any) => {
    
    // --- 1. PRODUCT CREATION FLOW ---
    if (input === 'm_add_prod') {
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: 'NAME_PENDING' } });
        return sendTextMessage(from, "🛍️ *Step 1:* What is the **Name** of your product?");
    }

    if (session.active_prod_id === 'NAME_PENDING') {
        const prod = await db.product.create({
            data: { name: input, price: 0, merchant_id: merchant.id, is_in_stock: false }
        });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: prod.id } });
        return sendTextMessage(from, `💰 *Step 2:* What is the price for *${input}*? (Numbers only)`);
    }

    if (session.active_prod_id && !isNaN(Number(input)) && session.active_prod_id !== 'NAME_PENDING') {
        await db.product.update({ where: { id: session.active_prod_id }, data: { price: parseFloat(input) } });
        return sendTextMessage(from, "📸 *Step 3:* Please send a **Photo** of the product.");
    }

    // Handle Image Upload for Product
    if (session.active_prod_id && message?.type === 'image') {
        await db.product.update({ 
            where: { id: session.active_prod_id }, 
            data: { image_url: message.image.id, is_in_stock: true } 
        });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        return sendButtons(from, "✅ *Product is Live!*", [{id: 'm_inventory', title: '📦 View Inventory'}]);
    }

    // --- 2. LOCATION UPDATE ---
    if (input === 'm_update_loc') {
        return sendTextMessage(from, "📍 Please share your **Location** via WhatsApp (Attach > Location) so students can find your shop.");
    }

    if (message?.type === 'location') {
        await db.merchant.update({
            where: { wa_id: from },
            data: { latitude: message.location.latitude, longitude: message.location.longitude }
        });
        return sendTextMessage(from, "✅ Shop location updated successfully!");
    }

    // --- 3. INVENTORY MANAGEMENT ---
    if (input === 'm_inventory') {
        const products = await db.product.findMany({ where: { merchant_id: merchant.id } });
        if (products.length === 0) return sendButtons(from, "Empty shop!", [{id: 'm_add_prod', title: 'Add Product'}]);

        for (const p of products) {
            await sendButtons(from, `📦 *${p.name}*\nR${p.price}\nStatus: ${p.is_in_stock ? '🟢 Live' : '🔴 Hidden'}`, [
                { id: `toggle_${p.id}`, title: p.is_in_stock ? 'Set Out of Stock' : 'Set In Stock' }
            ]);
        }
        return;
    }

    if (input.startsWith('toggle_')) {
        const pid = input.replace('toggle_', '');
        const p = await db.product.findUnique({ where: { id: pid } });
        await db.product.update({ where: { id: pid }, data: { is_in_stock: !p?.is_in_stock } });
        return sendTextMessage(from, "🔄 Status Updated.");
    }

    // --- 4. PAYOUTS & BALANCES ---
    if (input === 'm_payout') {
        const orders = await db.order.findMany({ where: { merchant_id: merchant.id, status: OrderStatus.COMPLETED, is_payout_set: false } });
        const sales = orders.reduce((s, o) => s + o.amount, 0);
        const fee = sales * OMERU_FEE;
        return sendTextMessage(from, `💰 *Weekly Settlement*\n\nGross Sales: R${sales.toFixed(2)}\nOMERU Fee (7%): -R${fee.toFixed(2)}\n\n*Net for Friday: R${(sales - fee).toFixed(2)}*`);
    }

    // DEFAULT DASHBOARD
    return showMerchantDashboard(from, merchant);
};

export const showMerchantDashboard = async (to: string, merchant: any) => {
    return sendButtons(to, `🏪 *${merchant.trading_name}*\nManagement Console`, [
        { id: 'm_inventory', title: '📦 My Shop' },
        { id: 'm_payout', title: '💰 Payout' },
        { id: 'm_update_loc', title: '📍 Update Location' }
    ]);
};