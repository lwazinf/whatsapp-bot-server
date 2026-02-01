import express from 'express';
import { handleIncomingMessage } from './services/whatsapp/handler';

const app = express();
app.use(express.json());

app.post('/api/whatsapp/webhook', async (req, res) => {
  // Always return 200 immediately so 360dialog doesn't retry
  res.sendStatus(200);
  
  // Handle logic in background
  await handleIncomingMessage(req.body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Omeru Live on Port ${PORT}`));