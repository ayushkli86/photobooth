/**
 * PHOTOBHOOH — All-in-one server
 * Works locally AND deploys to Vercel (api/ routes are separate)
 */
const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory store ────────────────────────
const rooms = new Map();

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

// ── API Routes ─────────────────────────────
app.post('/api/room', (req, res) => {
  try {
    const { action, code, theme, userId, photoIndex, imageData, state, currentPhoto } = req.body;

    switch (action) {
      case 'create': {
        let code;
        let tries = 0;
        do { code = genCode(); tries++; } while (rooms.has(code) && tries < 20);
        const room = {
          code, theme: theme || 'classic',
          host: userId || 'u_' + Date.now(),
          guest: null, photos: {}, state: 'waiting',
          currentPhoto: 0, created: Date.now(), updated: Date.now()
        };
        rooms.set(code, room);
        return res.json({ ok: true, code, room });
      }

      case 'join': {
        if (!code) return res.status(400).json({ error: 'Code required' });
        const room = rooms.get(code.toUpperCase());
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (room.guest) return res.status(409).json({ error: 'Room is full' });
        room.guest = userId || 'u_' + Date.now();
        room.state = 'ready';
        room.updated = Date.now();
        return res.json({ ok: true, code: code.toUpperCase(), room });
      }

      case 'get': {
        if (!code) return res.status(400).json({ error: 'Code required' });
        const room = rooms.get(code.toUpperCase());
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (Date.now() - room.created > 3600000) {
          rooms.delete(code.toUpperCase());
          return res.status(404).json({ error: 'Room expired' });
        }
        return res.json({ ok: true, room });
      }

      case 'set-theme': {
        if (!code) return res.status(400).json({ error: 'Code required' });
        const room = rooms.get(code.toUpperCase());
        if (!room) return res.status(404).json({ error: 'Room not found' });
        room.theme = theme;
        room.updated = Date.now();
        return res.json({ ok: true, room });
      }

      case 'update-state': {
        if (!code) return res.status(400).json({ error: 'Code required' });
        const room = rooms.get(code.toUpperCase());
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (state) room.state = state;
        if (currentPhoto !== undefined) room.currentPhoto = currentPhoto;
        room.updated = Date.now();
        return res.json({ ok: true, room });
      }

      case 'save-photo': {
        if (!code || photoIndex === undefined) return res.status(400).json({ error: 'Missing fields' });
        const room = rooms.get(code.toUpperCase());
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (!room.photos) room.photos = {};
        room.photos[`${userId}_${photoIndex}`] = imageData;
        room.updated = Date.now();
        return res.json({ ok: true });
      }

      case 'leave': {
        if (!code) return res.status(400).json({ error: 'Code required' });
        const room = rooms.get(code.toUpperCase());
        if (room) {
          if (userId === room.host) rooms.delete(code.toUpperCase());
          else if (userId === room.guest) { room.guest = null; room.state = 'waiting'; }
        }
        return res.json({ ok: true });
      }

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'photobooth', storage: 'in-memory' });
});

app.listen(PORT, () => {
  console.log(`\n  🎀 Photobooth running at http://localhost:${PORT}\n`);
});
