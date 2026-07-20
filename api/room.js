/**
 * POST /api/room — Create or Join a room
 */
const Storage = require('./storage');

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, code, theme, userId, photoIndex, imageData } = req.body;

  try {
    switch (action) {
      // ── CREATE ROOM ──────────────────────────────
      case 'create': {
        let code;
        let attempts = 0;
        // Ensure unique code
        do {
          code = generateCode();
          attempts++;
        } while (await Storage.get(`room:${code}`) && attempts < 10);

        const room = {
          code,
          theme: theme || 'classic',
          host: userId || `user_${Date.now()}`,
          guest: null,
          photos: {},
          state: 'waiting', // waiting | ready | shooting | done
          currentPhoto: 0,
          created: Date.now(),
          updated: Date.now()
        };

        // Store with 1 hour TTL
        await Storage.set(`room:${code}`, room, 3600);

        return res.status(200).json({
          ok: true,
          code,
          room
        });
      }

      // ── JOIN ROOM ────────────────────────────────
      case 'join': {
        if (!code) return res.status(400).json({ error: 'Code required' });

        const room = await Storage.get(`room:${code.toUpperCase()}`);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (room.guest) return res.status(409).json({ error: 'Room is full' });

        room.guest = userId || `user_${Date.now()}`;
        room.state = 'ready';
        room.updated = Date.now();

        await Storage.set(`room:${code.toUpperCase()}`, room, 3600);

        return res.status(200).json({
          ok: true,
          code: code.toUpperCase(),
          room
        });
      }

      // ── GET ROOM STATE ──────────────────────────
      case 'get': {
        if (!code) return res.status(400).json({ error: 'Code required' });

        const room = await Storage.get(`room:${code.toUpperCase()}`);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        // Auto-expire stale rooms (1 hour)
        if (Date.now() - room.created > 3600000) {
          await Storage.del(`room:${code.toUpperCase()}`);
          return res.status(404).json({ error: 'Room expired' });
        }

        return res.status(200).json({ ok: true, room });
      }

      // ── UPDATE THEME ────────────────────────────
      case 'set-theme': {
        if (!code) return res.status(400).json({ error: 'Code required' });

        const room = await Storage.get(`room:${code.toUpperCase()}`);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        room.theme = theme;
        room.updated = Date.now();
        await Storage.set(`room:${code.toUpperCase()}`, room, 3600);

        return res.status(200).json({ ok: true, room });
      }

      // ── UPDATE STATE ────────────────────────────
      case 'update-state': {
        if (!code) return res.status(400).json({ error: 'Code required' });

        const room = await Storage.get(`room:${code.toUpperCase()}`);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        if (req.body.state) room.state = req.body.state;
        if (req.body.currentPhoto !== undefined) room.currentPhoto = req.body.currentPhoto;
        room.updated = Date.now();

        await Storage.set(`room:${code.toUpperCase()}`, room, 3600);

        return res.status(200).json({ ok: true, room });
      }

      // ── SAVE PHOTO ──────────────────────────────
      case 'save-photo': {
        if (!code || photoIndex === undefined) {
          return res.status(400).json({ error: 'Code and photoIndex required' });
        }

        const room = await Storage.get(`room:${code.toUpperCase()}`);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        if (!room.photos) room.photos = {};
        room.photos[`${userId}_${photoIndex}`] = imageData;
        room.updated = Date.now();

        await Storage.set(`room:${code.toUpperCase()}`, room, 3600);

        return res.status(200).json({ ok: true });
      }

      // ── LEAVE / DELETE ROOM ─────────────────────
      case 'leave': {
        if (!code) return res.status(400).json({ error: 'Code required' });

        const room = await Storage.get(`room:${code.toUpperCase()}`);
        if (room) {
          if (userId === room.host) {
            await Storage.del(`room:${code.toUpperCase()}`);
          } else if (userId === room.guest) {
            room.guest = null;
            room.state = 'waiting';
            room.updated = Date.now();
            await Storage.set(`room:${code.toUpperCase()}`, room, 3600);
          }
        }

        return res.status(200).json({ ok: true });
      }

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    console.error('Room API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
