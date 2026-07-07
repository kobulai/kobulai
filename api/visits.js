export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const headers = { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` };

  async function redis(command) {
    const url = `${UPSTASH_REDIS_REST_URL}/${command}`;
    const r = await fetch(url, { headers });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    return d.result;
  }

  const now    = Math.floor(Date.now() / 1000);
  const cutoff = now - 25;
  const { action, id } = req.query;

  try {
    if (action === 'ping' && id) {
      await redis(`zadd/active_v2/${now}/${encodeURIComponent(id)}`);
      await redis(`zremrangebyscore/active_v2/0/${cutoff}`);
      const count = await redis('zcard/active_v2');
      return res.json({ count });
    }

    if (action === 'leave' && id) {
      await redis(`zrem/active_v2/${encodeURIComponent(id)}`);
      return res.json({ ok: true });
    }

    await redis(`zremrangebyscore/active_v2/0/${cutoff}`);
    const count = await redis('zcard/active_v2');
    return res.json({ count });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
