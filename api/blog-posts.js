export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

  try {
    const r = await fetch('https://notes.kobulai.blog/api/v1/memos?pageSize=20');
    if (!r.ok) return res.status(r.status).json({ error: 'Failed to fetch posts' });
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
