/**
 * Storage layer — Vercel KV with in-memory fallback
 * For production: uses @vercel/kv (Redis)
 * For local dev: uses in-memory Map
 */

// In-memory fallback for local development
const memStore = new Map();

// Try Vercel KV, fallback to memory
let kv = null;
try {
  if (process.env.KV_REST_API_URL) {
    const { kv: kvClient } = require('@vercel/kv');
    kv = kvClient;
  }
} catch (e) {
  console.log('Vercel KV not available, using in-memory storage');
}

const Storage = {
  async get(key) {
    if (kv) {
      return await kv.get(key);
    }
    const val = memStore.get(key);
    return val || null;
  },

  async set(key, value, ttl) {
    if (kv) {
      if (ttl) {
        await kv.set(key, value, { ex: ttl });
      } else {
        await kv.set(key, value);
      }
    } else {
      memStore.set(key, value);
      // Auto-expire for in-memory (1 hour)
      if (ttl) {
        setTimeout(() => memStore.delete(key), ttl * 1000);
      } else {
        setTimeout(() => memStore.delete(key), 3600000);
      }
    }
  },

  async del(key) {
    if (kv) {
      await kv.del(key);
    } else {
      memStore.delete(key);
    }
  },

  async incr(key) {
    if (kv) {
      return await kv.incr(key);
    }
    const val = (memStore.get(key) || 0) + 1;
    memStore.set(key, val);
    return val;
  }
};

module.exports = Storage;
