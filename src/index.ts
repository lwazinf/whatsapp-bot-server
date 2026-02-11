import express, { Request, Response } from 'express';
// Ensure this path matches your file structure
import { handleIncomingMessage } from './services/whatsapp/handler'; 

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '1mb' }));

/**
 * Health Check for Railway
 */
app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
});

/**
 * Webhook Verification
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
 * Main Webhook Handler
 */
app.post('/api/whatsapp/webhook', async (req: Request, res: Response) => {
    // 1. Respond 200 OK immediately to prevent retries
    res.status(200).send('OK');

    try {
        // 2. Navigate the nested Meta/360Dialog structure
        // Entry[0] -> Changes[0] -> Value -> Messages[0]
        const message = 
            req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || 
            req.body.messages?.[0];

        if (message) {
            console.log(`📩 Received ${message.type} from ${message.from}`);
            await handleIncomingMessage(message);
        } else {
            // Check if it's a status update (sent/delivered/read)
            const status = 
                req.body.entry?.[0]?.changes?.[0]?.value?.statuses?.[0] || 
                req.body.statuses?.[0];
            
            if (status) {
                console.log(`ℹ️ Message Status Update: ${status.status} for ${status.id}`);
            } else {
                console.log('❓ Unknown payload format received. Check Railway logs for body content.');
            }
        }
    } catch (err: any) {
        console.error('❌ Webhook Processing Error:', err.message);
        // Do not crash the server on logic errors
    }
});

app.listen(Number(PORT), '0.0.0.0', () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 OMERU SERVER LIVE`);
    console.log(`📡 Port: ${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});