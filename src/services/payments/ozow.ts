// ── OZOW INTEGRATION — COMMENTED OUT ─────────────────────────────────────
// Replaced by PayFast as the primary payment gateway.
// Ozow is retained here for reference and future reactivation as a
// secondary EFT option alongside PayFast.
// See: src/services/payments/payfast.ts
// ──────────────────────────────────────────────────────────────────────────

// import crypto from 'crypto';
// import axios from 'axios';
//
// const SITE_CODE   = process.env.OZOW_SITE_CODE   || 'NEE-NEE-004';
// const PRIVATE_KEY = process.env.OZOW_PRIVATE_KEY  || 'YNPKFYmwzKIK9kSjeElwrXYalANQWEUP';
// const API_KEY     = process.env.OZOW_API_KEY      || 'IGNs0870Yu9erbN2gZsSy0ludr8TAAzA';
// const IS_TEST     = process.env.OZOW_IS_TEST !== 'false'; // defaults to true
//
// const NOTIFY_URL  = process.env.OZOW_NOTIFY_URL  || 'https://your-server.com/webhook/ozow';
// const SUCCESS_URL = process.env.OZOW_SUCCESS_URL || 'https://your-server.com/payment/success';
// const CANCEL_URL  = process.env.OZOW_CANCEL_URL  || 'https://your-server.com/payment/cancel';
// const ERROR_URL   = process.env.OZOW_ERROR_URL   || 'https://your-server.com/payment/error';
//
// const sha512 = (input: string): string =>
//     crypto.createHash('sha512').update(input).digest('hex');
//
// export type OzowPaymentResult = {
//     paymentUrl: string;
//     transactionRef: string;
// };
//
// /**
//  * Create an Ozow payment request and return the hosted payment URL.
//  * The URL is sent to the customer via WhatsApp.
//  */
// export const createPaymentRequest = async (params: {
//     orderId: string;
//     amount: number;
//     merchantName: string;
// }): Promise<OzowPaymentResult> => {
//     const transactionRef = `OMERU-${params.orderId.slice(-8)}-${Date.now()}`.substring(0, 50);
//     const bankRef        = params.merchantName.substring(0, 20);
//     const amount         = params.amount.toFixed(2);
//
//     // Hash field order (verified against live API):
//     // SiteCode + CountryCode + CurrencyCode + Amount + TransactionReference +
//     // BankReference + CancelUrl + ErrorUrl + SuccessUrl + NotifyUrl + IsTest
//     // → append PrivateKey → lowercase entire string → SHA-512
//     const orderedValues = [
//         SITE_CODE, 'ZA', 'ZAR', amount,
//         transactionRef, bankRef,
//         CANCEL_URL, ERROR_URL, SUCCESS_URL, NOTIFY_URL,
//         IS_TEST ? 'true' : 'false'
//     ];
//     const hashCheck = sha512((orderedValues.join('') + PRIVATE_KEY).toLowerCase());
//
//     const response = await axios.post(
//         'https://api.ozow.com/PostPaymentRequest',
//         {
//             siteCode:             SITE_CODE,
//             countryCode:          'ZA',
//             currencyCode:         'ZAR',
//             amount,
//             transactionReference: transactionRef,
//             bankReference:        bankRef,
//             cancelUrl:            CANCEL_URL,
//             errorUrl:             ERROR_URL,
//             successUrl:           SUCCESS_URL,
//             notifyUrl:            NOTIFY_URL,
//             isTest:               IS_TEST,
//             hashCheck
//         },
//         {
//             headers: {
//                 ApiKey:         API_KEY,
//                 Accept:         'application/json',
//                 'Content-Type': 'application/json'
//             }
//         }
//     );
//
//     const paymentUrl = response.data?.url;
//     if (!paymentUrl) {
//         throw new Error(`Ozow did not return a payment URL: ${JSON.stringify(response.data)}`);
//     }
//
//     return { paymentUrl, transactionRef };
// };
//
// /**
//  * Verify the SHA-512 hash on an incoming Ozow webhook notification.
//  * Ozow concatenates the notification fields + private key, lowercases, and SHA-512 hashes.
//  */
// export const verifyWebhookHash = (body: Record<string, string>): boolean => {
//     const fields = [
//         body.SiteCode             || '',
//         body.TransactionId        || '',
//         body.TransactionReference || '',
//         body.Amount               || '',
//         body.Status               || '',
//         body.Optional1            || '',
//         body.Optional2            || '',
//         body.Optional3            || '',
//         body.CurrencyCode         || '',
//         body.IsTest               || '',
//         body.StatusMessage        || ''
//     ];
//     const expected = sha512((fields.join('') + PRIVATE_KEY).toLowerCase());
//     const received = (body.Hash || body.HashCheck || '').toLowerCase();
//     return expected === received;
// };
