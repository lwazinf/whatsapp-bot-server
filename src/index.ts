import express from 'express';
import dotenv from 'dotenv';
import { handleIncomingMessage } from './services/whatsapp/handler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'WhatsApp Multi-Business Bot API',
    timestamp: new Date().toISOString()
  });
});

// WhatsApp webhook endpoint
app.post('/api/whatsapp/webhook', async (req, res) => {
  console.log('📥 Received WhatsApp webhook');
  
  // Respond immediately (WhatsApp requires 200 within 20 seconds)
  res.sendStatus(200);
  
  // Process message asynchronously
  try {
    await handleIncomingMessage(req.body);
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
  }
});

// WhatsApp webhook verification
app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 WhatsApp webhook: http://localhost:${PORT}/api/whatsapp/webhook`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ WhatsApp API Key: ${process.env.WHATSAPP_API_KEY ? 'Set' : 'Missing'}`);
});
