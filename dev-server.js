/**
 * Local dev server — mimics Vercel's API routing
 * For local development only. On Vercel, api/ routes are used directly.
 */
const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Mount API routes
const roomHandler = require('./api/room');
const healthHandler = require('./api/health');

app.all('/api/room', roomHandler);
app.all('/api/health', healthHandler);

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🎀 Photobooth running at http://localhost:${PORT}\n`);
});
