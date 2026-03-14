import crypto from 'crypto';
import { db } from './db';

const BASE_URL = process.env.SHORT_LINK_BASE_URL || 'https://omeru.io';

/**
 * Create a short link and return the short URL.
 * Codes are 6-char alphanumeric (62^6 ≈ 56 billion combinations).
 */
export const createShortLink = async (url: string): Promise<string> => {
    // Retry in the unlikely event of a code collision
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = crypto.randomBytes(4).toString('base64url').slice(0, 6);
        try {
            await db.shortLink.create({ data: { code, url } });
            return `${BASE_URL}/p/${code}`;
        } catch {
            // cuid collision — retry
        }
    }
    // Fallback: return the original URL unshortened
    return url;
};
