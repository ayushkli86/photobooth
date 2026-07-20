/**
 * Storage layer — Upstash Redis (Vercel) with in-memory fallback (local dev)
 */

const { Redis } = require('@upstash/redis');

let redis = null;

// Vercel provides these env vars when Upstash is connected
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
  console.log('Using Upstash Redis storage');
} else {
  console.log('Using in-memory storage (local dev only)');
}

// ── In-memory fallback ──────────────────────
const memStore = new Map();
const memExpiry = new Map();

function memGet(key) {
  const exp = memExpiry.get(key);
  if (exp && Date.now() > exp) {
    memStore.delete(key);
    memExpiry.delete(key);
    return null;
  }
  return memStore.get(key) || null;
}

const Storage = {
  async get(key) {
    if (redis) {
      try { return await redis.get(key); } catch (e) { console.error('Redis get error:', e); return null; }
    }
    return memGet(key);
  },

  async set(key, value, ttl) {
    if (redis) {
      try {
        if (ttl) {
          await redis.set(key, JSON.stringify(value), { ex: ttl });
        } else {
          await redis.set(key, JSON.stringify(value));
        }
      } catch (e) { console.error('Redis set error:', e); }
      return;
    }
    memStore.set(key, value);
    if (ttl) memExpiry.set(key, Date.now() + ttl * 1000);
    else memExpiry.set(key, Date.now() + 3600000);
  },

  async del(key) {
    if (redis) {
      try { await redis.del(key); } catch (e) { console.error('Redis del error:', e); }
      return;
    }
    memStore.delete(key);
    memExpiry.delete(key);
  },
};

module.exports = Storage;
