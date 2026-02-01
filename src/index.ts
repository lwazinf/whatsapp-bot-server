import express from 'express';
import dotenv from 'dotenv';
import { handleIncomingMessage } from './services/whatsapp/handler';

dotenv.config();
const app = express();
app.use(express.json());

// Health Check
app.get('/', (req, res) => res.send({ status: 'Omeru Bot Online' }));

// Webhook Verification (for initial setup)
app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Incoming Messages
app.post('/api/whatsapp/webhook', async (req, res) => {
  res.sendStatus(200); // Respond fast to WhatsApp
  await handleIncomingMessage(req.body);
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Omeru Server Live on Port ${process.env.PORT || 3000}`);
});
