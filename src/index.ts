import express, { Request, Response } from 'express';
// These imports assume your files are in src/services/whatsapp/ as discussed
import { handleIncomingMessage } from './services/whatsapp/handler'; 

const app = express();
// Railway provides the PORT environment variable
const PORT = process.env.PORT || 8080;

// Increase limit to handle image uploads/media metadata if needed
app.use(express.json({ limit: '1mb' }));

/**
 * 1. Railway Health Check
 * Critical for the Railway proxy to mark the service as "Active"
 */
app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
});

/**
 * 2. WhatsApp Webhook Verification (GET)
 * Used by 360Dialog/Meta to verify the server ownership
 */
app.get('/api/whatsapp/webhook', (req: Request, res: Response) => {
    const challenge = req.query['hub.challenge'];
    const token = req.query['hub.verify_token'];

    if (token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully');
        return res.status(200).send(challenge);
    }
    
    console.warn('❌ Webhook verification failed: Invalid token');
    res.sendStatus(403);
});

/**
 * 3. Main Webhook Handler (POST)
 * Processes incoming WhatsApp messages
 */
app.post('/api/whatsapp/webhook', async (req: Request, res: Response) => {
    // Return 200 immediately. WhatsApp/360Dialog requires a response within 
    // a few seconds to avoid retries and 502/504 timeouts.
    res.status(200).send('OK');

    try {
        const message = req.body.messages?.[0];
        if (message) {
            console.log(`📩 Received message from ${message.from}`);
            // Logic handled asynchronously after responding OK
            await handleIncomingMessage(message);
        }
    } catch (err: any) {
        // Log errors so they appear in Railway 'Deploy Logs'
        console.error('❌ Webhook Logic Error:', err.message);
    }
});

/**
 * 4. Server Binding
 * Must listen on 0.0.0.0 to be reachable via Railway's Edge Proxy.
 */
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 OMERU SERVER LIVE`);
    console.log(`📡 Binding: 0.0.0.0:${PORT}`);
    console.log(`🔗 Health: /health`);
    console.log(`🔗 Webhook: /api/whatsapp/webhook`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});