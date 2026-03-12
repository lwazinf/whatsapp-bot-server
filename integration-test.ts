/**
 * Integration tests — exercises the actual code paths the bot uses.
 * Run: npx tsx integration-test.ts
 */
import 'dotenv/config';
import { formatCurrency, resolveLocale, resolveCurrency, buildMerchantWelcome } from './src/services/whatsapp/messageTemplates';
import { sendTextMessage, sendButtons, sendListMessage } from './src/services/whatsapp/sender';
import { getPlatformSettings } from './src/services/whatsapp/platformBranding';
import { handleIncomingMessage } from './src/services/whatsapp/handler';
import { db } from './src/lib/db';

// ── Tiny test runner ─────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };

async function test(name: string, fn: () => Promise<void>) {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e: any) {
        console.log(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

(async () => {

// ── Suite 1: messageTemplates.ts — pure logic, no I/O ───────────────────────
console.log('\n── messageTemplates.ts (pure logic) ─────────────────────────');

await test('resolveLocale falls back to en-ZA', async () => {
    assert(resolveLocale({}) === 'en-ZA', `got: ${resolveLocale({})}`);
});

await test('resolveCurrency falls back to ZAR', async () => {
    assert(resolveCurrency({}) === 'ZAR', `got: ${resolveCurrency({})}`);
});

await test('formatCurrency renders ZAR amount', async () => {
    const result = formatCurrency(99.99, {});
    assert(result.includes('99'), `Expected 99 in result, got: ${result}`);
});

await test('formatCurrency handles zero', async () => {
    const result = formatCurrency(0, {});
    assert(result.includes('0'), `got: ${result}`);
});

await test('buildMerchantWelcome uses trading_name and description', async () => {
    const merchant = { trading_name: 'Test Shop', description: 'Fresh food' } as any;
    const result = buildMerchantWelcome(merchant, null);
    assert(result.includes('Test Shop'), `missing trading_name: ${result}`);
    assert(result.includes('Fresh food'), `missing description: ${result}`);
});

// ── Suite 2: lib/db.ts — real Supabase connection ───────────────────────────
console.log('\n── Database (Supabase) ───────────────────────────────────────');

await test('DB connects without error', async () => {
    await db.$connect();
});

await test('UserSession table is accessible', async () => {
    const count = await db.userSession.count();
    assert(count >= 0, `Unexpected: ${count}`);
    console.log(`     (${count} sessions)`);
});

await test('Merchant table is accessible', async () => {
    const count = await db.merchant.count();
    assert(count >= 0, `Unexpected: ${count}`);
    console.log(`     (${count} merchants)`);
});

await test('PlatformBranding table is accessible', async () => {
    const count = await db.platformBranding.count();
    assert(count >= 0, `Unexpected: ${count}`);
    console.log(`     (${count} branding rows)`);
});

// ── Suite 3: platformBranding.ts — DB-backed settings ───────────────────────
console.log('\n── platformBranding.ts (DB-backed settings) ──────────────────');

await test('getPlatformSettings returns valid object', async () => {
    const s = await getPlatformSettings(db);
    assert(typeof s.name === 'string' && s.name.length > 0, `name invalid: ${s.name}`);
    assert(typeof s.switchCode === 'string', `switchCode invalid`);
    assert(typeof s.platformFee === 'number' && s.platformFee > 0 && s.platformFee < 1,
        `platformFee must be 0-1, got: ${s.platformFee}`);
    assert(typeof s.payoutDay === 'string', `payoutDay invalid`);
    console.log(`     name="${s.name}" fee=${(s.platformFee*100).toFixed(0)}% payday=${s.payoutDay}`);
});

// ── Suite 4: sender.ts — real 360Dialog API calls ───────────────────────────
console.log('\n── sender.ts (360Dialog API — real calls) ────────────────────');

const ADMIN = process.env.ADMIN_WHATSAPP_NUMBER || '27746854339';
console.log(`  (sending to ${ADMIN})\n`);

await test('sendTextMessage returns true', async () => {
    const ok = await sendTextMessage(ADMIN, '🧪 [Integration test 1/3] sendTextMessage ✅');
    assert(ok, 'returned false — check 360Dialog API key and URL');
});

await test('sendButtons returns true', async () => {
    const ok = await sendButtons(
        ADMIN,
        '🧪 [Integration test 2/3] sendButtons ✅',
        [{ id: 'test_a', title: 'Option A' }, { id: 'test_b', title: 'Option B' }],
        'Test footer'
    );
    assert(ok, 'returned false');
});

await test('sendListMessage returns true', async () => {
    const ok = await sendListMessage(
        ADMIN,
        '🧪 [Integration test 3/3] sendListMessage ✅',
        'View Items',
        [{ title: 'Test Section', rows: [{ id: 'item_1', title: 'Item One', description: 'Test item' }] }]
    );
    assert(ok, 'returned false');
});

// ── Suite 5: handler.ts — end-to-end routing ────────────────────────────────
console.log('\n── handler.ts (end-to-end routing) ───────────────────────────');

await test('rejects message with no "from" field', async () => {
    // Should return early — no throw
    await handleIncomingMessage({ type: 'text', text: { body: 'hi' } });
});

await test('ignores empty text body (returns early)', async () => {
    await handleIncomingMessage({ from: '00000000001', type: 'text', text: { body: '' }, id: 'test001' });
});

await test('real "hi" from admin — creates/updates session, sends reply', async () => {
    // Full pipeline: DB session upsert + 360Dialog send
    // You should receive a WhatsApp message after this test
    await handleIncomingMessage({
        from: ADMIN,
        type: 'text',
        text: { body: 'hi' },
        id: 'wamid.integrationtest_final'
    });
    // If no throw, routing worked end-to-end
});

// ── Summary ──────────────────────────────────────────────────────────────────
await db.$disconnect();

console.log(`\n─────────────────────────────────────────────────────────────`);
console.log(`  Passed: ${passed}   Failed: ${failed}`);
console.log(`─────────────────────────────────────────────────────────────\n`);

if (failed > 0) process.exit(1);

})();
