/**
 * GET /api/health — Health check endpoint
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json({
    ok: true,
    service: 'photobooth',
    timestamp: new Date().toISOString(),
    storage: process.env.KV_REST_API_URL ? 'vercel-kv' : 'in-memory'
  });
};
