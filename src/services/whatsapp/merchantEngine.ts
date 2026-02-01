import { PrismaClient, OrderStatus, MerchantStatus } from '@prisma/client';
import { sendTextMessage, sendButtons } from './sender';

const db = new PrismaClient();
const OMERU_FEE = 0.07;

export const processMerchantInput = async (from: string, input: string, session: any, merchant: any) => {
    
    // --- 1. PRODUCT CREATION ENGINE ---
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
        await db.product.update({ where: { id: session.active_prod_id }, data: { price: parseFloat(input), is_in_stock: true } });
        await db.userSession.update({ where: { wa_id: from }, data: { active_prod_id: null } });
        return sendButtons(from, "✅ *Product Live!*", [{id: 'm_inventory', title: '📦 View Inventory'}]);
    }

    // --- 2. INVENTORY & STOCK CONTROL ---
    if (input === 'm_inventory') {
        const products = await db.product.findMany({ where: { merchant_id: merchant.id } });
        if (products.length === 0) return sendButtons(from, "Empty shop!", [{id: 'm_add_prod', title: 'Add Product'}]);
        
        for (const p of products) {
            const status = p.is_in_stock ? "🟢 LIVE" : "🔴 HIDDEN";
            await sendButtons(from, `📦 *${p.name}*\nR${p.price}\nStatus: ${status}`, [
                { id: `toggle_${p.id}`, title: p.is_in_stock ? 'Mark Out of Stock' : 'Mark In Stock' }
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

    // --- 3. PAYOUT & SETTLEMENT ---
    if (input === 'm_payout') {
        const orders = await db.order.findMany({ where: { merchant_id: merchant.id, status: OrderStatus.COMPLETED, is_payout_set: false } });
        const sales = orders.reduce((s, o) => s + o.amount, 0);
        const fee = sales * OMERU_FEE;
        const total = sales - fee - merchant.total_fees_due;

        return sendTextMessage(from, `💰 *Friday Settlement*\n\nGross: R${sales.toFixed(2)}\nOMERU (7%): -R${fee.toFixed(2)}\nFees: -R${merchant.total_fees_due.toFixed(2)}\n\n*Net: R${total.toFixed(2)}*`);
    }

    // --- 4. TRANSACTION HISTORY (PAID REPORTS) ---
    if (input === 'm_history_menu') {
        return sendButtons(from, "🕒 *Reports*\nBeyond 30 days requires a convenience fee.", [
            { id: 'hist_30', title: '30 Days (Free)' },
            { id: 'hist_60', title: '60 Days (R5)' },
            { id: 'hist_90', title: '90 Days (R10)' }
        ]);
    }

    if (input.startsWith('hist_')) {
        const days = input === 'hist_30' ? 30 : (input === 'hist_60' ? 60 : 90);
        const cost = days === 60 ? 5 : (days === 90 ? 10 : 0);
        
        if (cost > 0) {
            await db.merchant.update({ where: { id: merchant.id }, data: { total_fees_due: { increment: cost } } });
        }
        
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - days);
        const history = await db.order.findMany({ where: { merchant_id: merchant.id, createdAt: { gte: dateLimit } } });
        
        const summary = history.map(o => `🔹 ${o.createdAt.toLocaleDateString()}: R${o.amount}`).join('\n');
        return sendTextMessage(from, `📋 *${days} Day History*\n\n${summary || "No sales found."}`);
    }

    // --- FALLBACK: DASHBOARD ---
    return sendButtons(from, "🏪 *Merchant Dashboard*", [
        { id: 'm_inventory', title: '📦 Inventory' },
        { id: 'm_payout', title: '💰 Payout' },
        { id: 'm_history_menu', title: '🕒 History' }
    ]);
};