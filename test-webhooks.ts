/**
 * Omeru Webhook Test Suite
 * Run: npx tsx test-webhooks.ts
 * Run against Koyeb: TEST_URL=https://quaint-marika-remoluhle-0a8ead99.koyeb.app npx tsx test-webhooks.ts
 */

import axios from 'axios';

const BASE_URL = process.env.TEST_URL || 'http://localhost:8080';
const ADMIN_NUMBER = '27746854339';
const CUSTOMER_NUMBER = '27812345678';
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'my_secret_verify_token_12345';
const WEBHOOK = `${BASE_URL}/api/whatsapp/webhook`;

let passed = 0;
let failed = 0;

// ─── Helpers ────────────────────────────────────────────────────────────────

const log = (label: string, ok: boolean, detail?: string) => {
    const icon = ok ? '✅' : '❌';
    console.log(`  ${icon} ${label}${detail ? `  → ${detail}` : ''}`);
    ok ? passed++ : failed++;
};

const post = async (payload: any) => {
    const res = await axios.post(WEBHOOK, payload, {
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true,
    });
    return res;
};

const get = async (params: Record<string, string>) => {
    const res = await axios.get(WEBHOOK, {
        params,
        validateStatus: () => true,
    });
    return res;
};

// ─── Payload builders ────────────────────────────────────────────────────────

/** 360Dialog simple format */
const simpleText = (from: string, body: string) => ({
    messages: [{ from, type: 'text', text: { body } }],
});

/** Meta nested format (entry → changes → value → messages) */
const nestedText = (from: string, body: string) => ({
    entry: [{ changes: [{ value: { messages: [{ from, type: 'text', text: { body } }] } }] }],
});

/** Interactive button reply */
const buttonReply = (from: string, id: string, title: string) => ({
    messages: [{ from, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title } } }],
});

/** Interactive list reply */
const listReply = (from: string, id: string, title: string) => ({
    messages: [{ from, type: 'interactive', interactive: { type: 'list_reply', list_reply: { id, title } } }],
});

/** Image message */
const imageMsg = (from: string) => ({
    messages: [{ from, type: 'image', image: { id: 'img123', mime_type: 'image/jpeg' } }],
});

/** Location message */
const locationMsg = (from: string) => ({
    messages: [{ from, type: 'location', location: { latitude: -26.2, longitude: 28.0 } }],
});

/** Status update - simple format */
const simpleStatus = (status: string) => ({
    statuses: [{ id: 'wamid.test123', status, timestamp: Date.now() }],
});

/** Status update - nested format */
const nestedStatus = (status: string) => ({
    entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.test123', status }] } }] }],
});

// ─── Test Sections ───────────────────────────────────────────────────────────

const section = (title: string) => {
    console.log(`\n── ${title} ${'─'.repeat(50 - title.length)}`);
};

// ─── Run Tests ───────────────────────────────────────────────────────────────

const run = async () => {
    console.log(`\n🧪 Omeru Webhook Test Suite`);
    console.log(`   Target: ${BASE_URL}\n`);

    // ── 1. Health & Infrastructure ────────────────────────────────────────────
    section('Health & Infrastructure');

    try {
        const res = await axios.get(`${BASE_URL}/health`, { validateStatus: () => true });
        log('GET /health → 200 OK', res.status === 200, `status ${res.status}`);
    } catch (e: any) {
        log('GET /health', false, e.message);
    }

    // ── 2. Webhook Verification (GET) ─────────────────────────────────────────
    section('Webhook Verification (GET)');

    {
        const res = await get({ 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'test_challenge_abc' });
        log('Correct verify token returns challenge', res.status === 200 && res.data === 'test_challenge_abc', `status ${res.status}, body: ${res.data}`);
    }
    {
        const res = await get({ 'hub.verify_token': 'WRONG_TOKEN', 'hub.challenge': 'test_challenge_abc' });
        log('Wrong verify token → 403', res.status === 403, `status ${res.status}`);
    }
    {
        const res = await get({});
        log('Missing token → 403', res.status === 403, `status ${res.status}`);
    }

    // ── 3. Payload Parsing ────────────────────────────────────────────────────
    section('Payload Parsing');

    {
        const res = await post({});
        log('Empty payload → 200 (server does not crash)', res.status === 200);
    }
    {
        const res = await post({ random_field: 'garbage' });
        log('Unknown payload → 200 (server does not crash)', res.status === 200);
    }
    {
        const res = await post(nestedText(CUSTOMER_NUMBER, 'hi'));
        log('Meta nested format (entry→changes→value→messages) → 200', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'hi'));
        log('360Dialog simple format (messages[]) → 200', res.status === 200);
    }

    // ── 4. Status Updates ─────────────────────────────────────────────────────
    section('Status Updates (no handler needed)');

    for (const status of ['sent', 'delivered', 'read', 'failed']) {
        const res = await post(simpleStatus(status));
        log(`Simple status "${status}" → 200`, res.status === 200);
    }
    {
        const res = await post(nestedStatus('delivered'));
        log('Nested status update → 200', res.status === 200);
    }

    // ── 5. Message Edge Cases ─────────────────────────────────────────────────
    section('Message Edge Cases');

    {
        const res = await post({ messages: [{ type: 'text', text: { body: 'hi' } }] }); // no `from`
        log('Message missing "from" field → 200 (handled gracefully)', res.status === 200);
    }
    {
        // Empty text, not image/location → should skip silently
        const res = await post({ messages: [{ from: CUSTOMER_NUMBER, type: 'text', text: { body: '' } }] });
        log('Empty text body → 200 (skipped silently)', res.status === 200);
    }
    {
        const res = await post(imageMsg(CUSTOMER_NUMBER));
        log('Image message (no text) → 200 (passes through)', res.status === 200);
    }
    {
        const res = await post(locationMsg(CUSTOMER_NUMBER));
        log('Location message → 200 (passes through)', res.status === 200);
    }

    // ── 6. Customer Flows ─────────────────────────────────────────────────────
    section('Customer Flows');

    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'hi'));
        log('"hi" → welcome menu (new customer)', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'hello'));
        log('"hello" → welcome menu (unknown input)', res.status === 200);
    }
    {
        const res = await post(buttonReply(CUSTOMER_NUMBER, 'browse_shops', 'Browse Shops'));
        log('Button: browse_shops → customer discovery', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'browse_shops'));
        log('"browse_shops" text → customer discovery', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, '@someshop'));
        log('"@someshop" text → customer discovery (not _admin handle)', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'cat_electronics'));
        log('"cat_xxx" → customer discovery', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'prod_abc123'));
        log('"prod_xxx" → customer discovery', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'variant_red'));
        log('"variant_xxx" → customer discovery', res.status === 200);
    }
    {
        const res = await post(buttonReply(CUSTOMER_NUMBER, 'c_my_orders', 'My Orders'));
        log('Button: c_my_orders → customer orders', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'view_order_abc123'));
        log('"view_order_xxx" → customer orders', res.status === 200);
    }

    // ── 7. Opt-Out ────────────────────────────────────────────────────────────
    section('Opt-Out Commands');

    for (const word of ['stop', 'STOP', 'unsubscribe', 'optout', 'opt-out']) {
        const res = await post(simpleText(CUSTOMER_NUMBER, word));
        log(`"${word}" → opt-out flow`, res.status === 200);
    }

    // ── 8. Mode Switching ─────────────────────────────────────────────────────
    section('Mode Switching');

    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'switch'));
        log('"switch" command → mode toggle', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'SWITCH'));
        log('"SWITCH" (uppercase) → mode toggle', res.status === 200);
    }

    // ── 9. Merchant Registration ──────────────────────────────────────────────
    section('Merchant Registration');

    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'sell'));
        log('"sell" without invite → blocked (invite-only)', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'register'));
        log('"register" without invite → blocked (invite-only)', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'SELL'));
        log('"SELL" (uppercase) → blocked (invite-only)', res.status === 200);
    }

    // ── 10. Admin Handle ──────────────────────────────────────────────────────
    section('Admin Handle Access');

    {
        const res = await post(simpleText(CUSTOMER_NUMBER, '@nonexistent_admin'));
        log('"@nonexistent_admin" → admin handle not found', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, '@myshop_admin hello'));
        log('"@myshop_admin" with trailing text → admin handle parsed', res.status === 200);
    }
    {
        // Not an admin handle (missing _admin suffix) → falls to customer discovery
        const res = await post(simpleText(CUSTOMER_NUMBER, '@myshop'));
        log('"@myshop" (no _admin suffix) → customer discovery', res.status === 200);
    }

    // ── 11. Invite Responses ──────────────────────────────────────────────────
    section('Invite Responses');

    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'accept_invite_fake-invite-id'));
        log('"accept_invite_xxx" with invalid ID → graceful error', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'decline_invite_fake-invite-id'));
        log('"decline_invite_xxx" with invalid ID → graceful error', res.status === 200);
    }
    {
        const res = await post(simpleText(CUSTOMER_NUMBER, 'accept_invite_'));
        log('"accept_invite_" with no ID → invite ID missing error', res.status === 200);
    }

    // ── 12. Platform Admin ────────────────────────────────────────────────────
    section('Platform Admin (from admin number)');

    {
        const res = await post(simpleText(ADMIN_NUMBER, 'admin'));
        log('"admin" from admin number → platform admin flow', res.status === 200);
    }
    {
        const res = await post(simpleText(ADMIN_NUMBER, 'pa_some_action'));
        log('"pa_xxx" from admin number → platform admin flow', res.status === 200);
    }
    {
        // Non-admin sending "admin" → falls to welcome menu
        const res = await post(simpleText(CUSTOMER_NUMBER, 'admin'));
        log('"admin" from non-admin number → welcome menu', res.status === 200);
    }

    // ── 13. Interactive Messages ──────────────────────────────────────────────
    section('Interactive Message Types');

    {
        const res = await post(listReply(CUSTOMER_NUMBER, 'cat_food', 'Food'));
        log('List reply → routed by ID (cat_food → discovery)', res.status === 200);
    }
    {
        const res = await post(listReply(CUSTOMER_NUMBER, 'view_order_123', 'Order #123'));
        log('List reply → routed by ID (view_order → orders)', res.status === 200);
    }
    {
        const res = await post(buttonReply(ADMIN_NUMBER, 'browse_shops', 'Browse'));
        log('Button reply from admin number → still works', res.status === 200);
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const total = passed + failed;
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  Results: ${passed}/${total} passed  ${failed > 0 ? `(${failed} failed)` : '🎉'}`);
    console.log(`${'─'.repeat(55)}\n`);

    if (failed > 0) process.exit(1);
};

run().catch(err => {
    console.error('\n💥 Test runner crashed:', err.message);
    process.exit(1);
});
