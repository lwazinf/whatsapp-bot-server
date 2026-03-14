import crypto from 'crypto';
import axios from 'axios';

// ── Config ─────────────────────────────────────────────────────────────────

const MERCHANT_ID  = process.env.PAYFAST_MERCHANT_ID  || '';
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || '';
const PASSPHRASE   = process.env.PAYFAST_PASSPHRASE   || '';
const IS_SANDBOX   = process.env.PAYFAST_IS_SANDBOX !== 'false'; // defaults to sandbox

const NOTIFY_URL = process.env.PAYFAST_NOTIFY_URL || '';
const RETURN_URL = process.env.PAYFAST_RETURN_URL || '';
const CANCEL_URL = process.env.PAYFAST_CANCEL_URL || '';

const PAYMENT_PAGE_URL = IS_SANDBOX
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

const VALIDATE_URL = IS_SANDBOX
    ? 'https://sandbox.payfast.co.za/eng/query/validate'
    : 'https://www.payfast.co.za/eng/query/validate';

// PayFast production ITN source IPs (197.97.145.144/28 + 41.74.179.192/27)
const VALID_IPS = new Set([
    '197.97.145.144','197.97.145.145','197.97.145.146','197.97.145.147',
    '197.97.145.148','197.97.145.149','197.97.145.150','197.97.145.151',
    '197.97.145.152','197.97.145.153','197.97.145.154','197.97.145.155',
    '197.97.145.156','197.97.145.157','197.97.145.158','197.97.145.159',
    '41.74.179.192', '41.74.179.193', '41.74.179.194', '41.74.179.195',
    '41.74.179.196', '41.74.179.197', '41.74.179.198', '41.74.179.199',
    '41.74.179.200', '41.74.179.201', '41.74.179.202', '41.74.179.203',
    '41.74.179.204', '41.74.179.205', '41.74.179.206', '41.74.179.207',
    '41.74.179.208', '41.74.179.209', '41.74.179.210', '41.74.179.211',
    '41.74.179.212', '41.74.179.213', '41.74.179.214', '41.74.179.215',
    '41.74.179.216', '41.74.179.217', '41.74.179.218', '41.74.179.219',
    '41.74.179.220', '41.74.179.221', '41.74.179.222', '41.74.179.223',
]);

// ── Types ──────────────────────────────────────────────────────────────────

export type PayfastPaymentResult = {
    paymentUrl: string;
    transactionRef: string;
};

// ── Signature ──────────────────────────────────────────────────────────────

/**
 * Build a PayFast MD5 signature from a params object.
 *
 * Rules (per PayFast docs):
 *   - Params must be in the same order they appear in the request
 *   - 'signature' key is excluded
 *   - Empty-string values are excluded
 *   - Values are URL-encoded with spaces as '+'
 *   - Passphrase appended as &passphrase=... if set, otherwise trailing & removed
 */
const generateSignature = (params: Record<string, string>): string => {
    let pfString = '';
    for (const [key, val] of Object.entries(params)) {
        if (key !== 'signature' && val !== '') {
            pfString += `${key}=${encodeURIComponent(val.trim()).replace(/%20/g, '+')}&`;
        }
    }
    if (PASSPHRASE) {
        pfString += `passphrase=${encodeURIComponent(PASSPHRASE.trim()).replace(/%20/g, '+')}`;
    } else {
        pfString = pfString.slice(0, -1); // strip trailing &
    }
    return crypto.createHash('md5').update(pfString).digest('hex');
};

// ── Payment Creation ───────────────────────────────────────────────────────

/**
 * Build a PayFast hosted payment URL for the given order.
 *
 * The URL is sent to the customer via WhatsApp — they tap it and pay in browser.
 * transactionRef = orderId, stored as Order.payment_ref to look up on ITN.
 *
 * Drop-in replacement for Ozow's createPaymentRequest — same call signature.
 */
export const createPaymentRequest = async (params: {
    orderId: string;
    amount: number;
    merchantName: string;
}): Promise<PayfastPaymentResult> => {
    if (!MERCHANT_ID || !MERCHANT_KEY) {
        throw new Error('PayFast: PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY must be set');
    }

    // Param order is significant — must match for signature correctness
    const pfParams: Record<string, string> = {
        merchant_id:  MERCHANT_ID,
        merchant_key: MERCHANT_KEY,
        return_url:   RETURN_URL,
        cancel_url:   CANCEL_URL,
        notify_url:   NOTIFY_URL,
        m_payment_id: params.orderId,
        amount:       params.amount.toFixed(2),
        item_name:    `Order from ${params.merchantName}`.substring(0, 100),
    };

    pfParams.signature = generateSignature(pfParams);

    const queryString = new URLSearchParams(pfParams).toString();
    const paymentUrl = `${PAYMENT_PAGE_URL}?${queryString}`;

    console.log(`💳 PayFast: generated payment URL for order ${params.orderId.slice(-5)} — R${pfParams.amount} [${IS_SANDBOX ? 'SANDBOX' : 'LIVE'}]`);

    return {
        paymentUrl,
        transactionRef: params.orderId, // orderId stored as payment_ref → looked up on ITN via m_payment_id
    };
};

// ── ITN Verification ───────────────────────────────────────────────────────

/**
 * Verify a PayFast ITN (Instant Transaction Notification) webhook payload.
 *
 * Steps:
 *   1. Rebuild signature from payload (excluding 'signature' field) and compare
 *   2. Validate source IP against PayFast's known ranges (production only)
 *   3. Call PayFast's validation endpoint to confirm the ITN is genuine
 *
 * Set PAYFAST_SKIP_VERIFY=true to bypass all checks (dev / local testing only).
 */
export const verifyITN = async (
    body: Record<string, string>,
    sourceIp?: string
): Promise<{ valid: boolean; reason?: string }> => {
    if (process.env.PAYFAST_SKIP_VERIFY === 'true') {
        console.warn('⚠️ PayFast ITN: skipping verification (PAYFAST_SKIP_VERIFY=true)');
        return { valid: true };
    }

    // 1. Signature check
    const { signature: receivedSig, ...paramsWithoutSig } = body;
    const expectedSig = generateSignature(paramsWithoutSig as Record<string, string>);
    if (expectedSig !== receivedSig) {
        return { valid: false, reason: `Signature mismatch (expected ${expectedSig}, got ${receivedSig})` };
    }

    // 2. IP check — skip entirely in sandbox mode
    if (!IS_SANDBOX && sourceIp) {
        const cleanIp = sourceIp.split(',')[0].trim();
        if (!VALID_IPS.has(cleanIp)) {
            return { valid: false, reason: `Untrusted source IP: ${cleanIp}` };
        }
    }

    // 3. PayFast validation endpoint — confirms ITN is genuine
    try {
        const pfParamString = Object.entries(paramsWithoutSig as Record<string, string>)
            .filter(([, v]) => v !== '')
            .map(([k, v]) => `${k}=${encodeURIComponent(v ?? '').replace(/%20/g, '+')}`)
            .join('&');

        const validateRes = await axios.post(VALIDATE_URL, pfParamString, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10_000,
        });

        if (validateRes.data !== 'VALID') {
            return { valid: false, reason: `PayFast validation endpoint returned: ${validateRes.data}` };
        }
    } catch (err: any) {
        return { valid: false, reason: `Validation endpoint error: ${err.message}` };
    }

    return { valid: true };
};
