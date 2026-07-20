/**
 * GET /api/health — Health check
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const hasUpstash = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  return res.status(200).json({
    ok: true,
    service: 'photobooth',
    timestamp: new Date().toISOString(),
    storage: hasUpstash ? 'upstash-redis' : 'in-memory',
    version: '1.0.0'
  });
};
