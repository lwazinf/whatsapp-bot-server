import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
// FIX: Using flat imports based on your file uploads
import { handleIncomingMessage } from './services/whatsapp/handler'; 
import { markAsRead } from './services/whatsapp/sender';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json({ limit: '1mb' }));

// 1. FIXED HEALTH CHECK
// This must work for Railway to show your service as "Active"
app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
});

// 2. FIXED WEBHOOK VERIFICATION
app.get('/api/whatsapp/webhook', (req: Request, res: Response) => {
    const challenge = req.query['hub.challenge'];
    const token = req.query['hub.verify_token'];

    if (token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }
    res.sendStatus(403);
});

// 3. ROBUST MESSAGE HANDLER
app.post('/api/whatsapp/webhook', async (req: Request, res: Response) => {
    // Return 200 immediately to prevent 502 timeouts
    res.status(200).send('OK');

    try {
        const message = req.body.messages?.[0];
        if (message) {
            console.log(`📩 Received from ${message.from}`);
            await handleIncomingMessage(message);
        }
    } catch (err: any) {
        console.error('❌ Logic Error:', err.message);
    }
});

// 4. CRITICAL: NETWORK BINDING
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 OMERU SERVER LIVE`);
    console.log(`📡 Binding: 0.0.0.0:${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});