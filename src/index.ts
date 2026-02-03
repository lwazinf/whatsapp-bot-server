import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cron from 'node-cron';
import { handleIncomingMessage } from './services/whatsapp/handler';
import { checkStaleOrders } from './services/jobs/orderAlerts';
import { markAsRead } from './services/whatsapp/sender';

const app = express();

// ============ CONFIGURATION ============

const PORT = process.env.PORT || 3000;
const WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

// Validate required environment variables
const requiredEnvVars = [
    'WHATSAPP_API_KEY',
    'WHATSAPP_PHONE_ID',
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    'DATABASE_URL'
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
}

// ============ MIDDLEWARE ============

app.use(bodyParser.json({ limit: '1mb' }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (req.path !== '/health') {
            console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
        }
    });
    next();
});

// Simple rate limiting
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100;
const RATE_WINDOW = 60000;

const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    const record = requestCounts.get(ip);
    if (!record || now > record.resetTime) {
        requestCounts.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
        return next();
    }
    
    record.count++;
    if (record.count > RATE_LIMIT) {
        console.warn(`⚠️ Rate limit exceeded for IP: ${ip}`);
        return res.status(429).json({ error: 'Too many requests' });
    }
    
    next();
};

app.use('/api/whatsapp/webhook', rateLimiter);

// ============ ROUTES ============

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

/**
 * Meta Webhook Verification (GET)
 */
app.get('/api/whatsapp/webhook', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('🔐 Webhook verification attempt:', { mode, tokenReceived: !!token });

    if (!WEBHOOK_VERIFY_TOKEN) {
        console.error('❌ WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured!');
        return res.sendStatus(500);
    }

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully');
        return res.status(200).send(challenge);
    }
    
    console.warn('⚠️ Webhook verification failed - token mismatch');
    return res.sendStatus(403);
});

/**
 * Incoming Messages Webhook (POST)
 */
app.post('/api/whatsapp/webhook', async (req: Request, res: Response) => {
    // Always respond quickly to Meta
    res.sendStatus(200);
    
    try {
        if (!req.body || !req.body.entry) {
            return;
        }

        const entry = req.body.entry[0];
        if (!entry?.changes?.[0]) {
            return;
        }

        const changes = entry.changes[0];
        const value = changes.value;

        // Handle message status updates
        if (value.statuses) {
            handleStatusUpdate(value.statuses[0]);
            return;
        }

        // Handle incoming messages
        if (value.messages && value.messages.length > 0) {
            const message = value.messages[0];
            
            // Add 'from' field from contacts if not present
            if (!message.from && value.contacts?.[0]?.wa_id) {
                message.from = value.contacts[0].wa_id;
            }
            
            // Mark message as read
            if (message.id) {
                markAsRead(message.id).catch(err => 
                    console.warn('⚠️ Failed to mark as read:', err.message)
                );
            }

            console.log('📩 Incoming message:', JSON.stringify(message, null, 2));
            await handleIncomingMessage(message);
        }

    } catch (error: any) {
        console.error('❌ Webhook processing error:', error.message);
    }
});

/**
 * Handle message status updates
 */
const handleStatusUpdate = (status: any) => {
    if (!status) return;
    
    const { id, status: messageStatus, recipient_id } = status;
    
    // Only log failures
    if (messageStatus === 'failed') {
        console.error('❌ Message delivery failed:', status.errors);
    }
};

// ============ ERROR HANDLING ============

app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('❌ Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// ============ CRON JOBS ============

const staleOrderJob = cron.schedule('*/5 * * * *', async () => {
    console.log('⏰ Running stale order check...');
    try {
        await checkStaleOrders();
    } catch (error: any) {
        console.error('❌ Stale order check failed:', error.message);
    }
}, {
    scheduled: true,
    timezone: 'Africa/Johannesburg'
});

// ============ GRACEFUL SHUTDOWN ============

const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down...`);
    staleOrderJob.stop();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============ START SERVER ============

const server = app.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Omeru WhatsApp Server`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

export default app;
