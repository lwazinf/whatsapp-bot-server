// Main server entry - See previous implementation
// Copy from original meat-ordering-bot/src/index.ts
import express from 'express';
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', multi_business: true });
});

app.listen(PORT, () => {
  console.log(`🚀 Multi-Business Server running on port ${PORT}`);
});
