const Storage = require('./storage');

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); } });
    req.on('error', reject);
  });
}

async function getRoom(code) {
  let room = await Storage.get('room:' + code);
  if (typeof room === 'string') { try { room = JSON.parse(room); } catch (e) { return null; } }
  return room || null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const { action, code, theme, userId, state, currentPhoto } = body;

    switch (action) {
      case 'create': {
        let code; let attempts = 0;
        do { code = generateCode(); attempts++; } while (await getRoom(code) && attempts < 20);
        const room = {
          code, theme: theme || 'classic',
          host: userId || 'u_' + Date.now(), guest: null,
          state: 'waiting', currentPhoto: 0,
          created: Date.now(), updated: Date.now()
        };
        await Storage.set('room:' + code, room, 3600);
        return res.status(200).json({ ok: true, code, room });
      }

      case 'join': {
        if (!code) return res.status(400).json({ error: 'Code required' });
        const room = await getRoom(code.toUpperCase());
        if (!room) return res.status(404).json({ error: 'Room not found. Check the code and try again.' });
        if (room.guest) return res.status(409).json({ error: 'Room is full' });
        room.guest = userId || 'u_' + Date.now();
        room.state = 'ready';
        room.updated = Date.now();
        await Storage.set('room:' + code.toUpperCase(), room, 3600);
        return res.status(200).json({ ok: true, code: code.toUpperCase(), room });
      }

      case 'get': {
        if (!code) return res.status(400).json({ error: 'Code required' });
        const room = await getRoom(code.toUpperCase());
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (Date.now() - room.created > 3600000) {
          await Storage.del('room:' + code.toUpperCase());
          return res.status(404).json({ error: 'Room expired' });
        }
        return res.status(200).json({ ok: true, room });
      }

      case 'update-state': {
        if (!code) return res.status(400).json({ error: 'Code required' });
        const room = await getRoom(code.toUpperCase());
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (state) room.state = state;
        if (currentPhoto !== undefined) room.currentPhoto = currentPhoto;
        room.updated = Date.now();
        await Storage.set('room:' + code.toUpperCase(), room, 3600);
        return res.status(200).json({ ok: true, room });
      }

      // WebRTC signaling: save a signal message (room-level queue)
      case 'signal': {
        if (!code || !userId || !body.type) return res.status(400).json({ error: 'Missing fields' });
        const signalKey = 'signals:' + code.toUpperCase();
        const { type, data } = body;
        let signals = await Storage.get(signalKey);
        if (typeof signals === 'string') { try { signals = JSON.parse(signals); } catch(e) { signals = []; } }
        if (!Array.isArray(signals)) signals = [];
        signals.push({ type, data, from: userId, ts: Date.now() });
        if (signals.length > 100) signals = signals.slice(-100);
        await Storage.set(signalKey, signals, 3600);
        return res.status(200).json({ ok: true });
      }

      // WebRTC signaling: get all signals since timestamp
      case 'get-signals': {
        if (!code) return res.status(400).json({ error: 'Code required' });
        const signalKey = 'signals:' + code.toUpperCase();
        let signals = await Storage.get(signalKey);
        if (typeof signals === 'string') { try { signals = JSON.parse(signals); } catch(e) { signals = []; } }
        if (!Array.isArray(signals)) signals = [];
        return res.status(200).json({ ok: true, signals });
      }

      case 'leave': {
        if (!code) return res.status(400).json({ error: 'Code required' });
        const room = await getRoom(code.toUpperCase());
        if (room) {
          if (userId === room.host) await Storage.del('room:' + code.toUpperCase());
          else if (userId === room.guest) {
            room.guest = null; room.state = 'waiting'; room.updated = Date.now();
            await Storage.set('room:' + code.toUpperCase(), room, 3600);
          }
        }
        return res.status(200).json({ ok: true });
      }

      default: return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    console.error('Room API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
