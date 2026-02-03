import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cron from 'node-cron';
// ADJUST THESE PATHS if your files are in subfolders like './services/whatsapp/handler'
import { handleIncomingMessage } from './services/whatsapp/handler'; 
// import { checkStaleOrders } from './orderAlerts'; // Uncomment if you have this file
// import { markAsRead } from './sender'; // Uncomment if needed

const app = express();

// ============ CONFIGURATION ============\n
// Railway injects PORT automatically, but we must use it.
const PORT = process.env.PORT || 3000;
const WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

// ============ MIDDLEWARE ============\n
app.use(bodyParser.json({ limit: '1mb' }));

// Logging
app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path !== '/health') {
        console.log(`${req.method} ${req.path}`, req.body);
    }
    next();
});

// ============ ROUTES ============\n

// 1. Health Check (Critical for Railway)
app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
});

// 2. Webhook Verification (Meta Challenge)
app.get('/api/whatsapp/webhook', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully!');
        res.status(200).send(challenge);
    } else {
        console.error('❌ Webhook verification failed. Token mismatch.');
        res.sendStatus(403);
    }
});

// 3. Webhook Event Listener (Messages)
app.post('/api/whatsapp/webhook', async (req: Request, res: Response) => {
    try {
        const body = req.body;
        
        // Check if this is a message event
        if (body.messages && body.messages.length > 0) {
            // Process async - don't hold up the response
            handleIncomingMessage(body.messages[0]).catch(err => 
                console.error('❌ Handler Error:', err)
            );
        }

        res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
        console.error('❌ Webhook Error:', error);
        res.status(500).send('Server Error');
    }
});

// ============ START SERVER ============\n

// CRITICAL FIX: Added '0.0.0.0' as the second argument
const server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Omeru WhatsApp Server Active`);
    console.log(`📡 Listening on: 0.0.0.0:${PORT}`);
    console.log(`🔗 Webhook Path: /api/whatsapp/webhook`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});