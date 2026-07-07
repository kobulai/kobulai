export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text } = req.body;
  if (!text || text.trim().length < 2) return res.status(400).json({ error: 'Too short' });
  if (text.length > 200) return res.status(400).json({ error: 'Too long' });

  const { GITHUB_TOKEN } = process.env;
  const REPO = 'kobulai/blog';
  const FILE = 'recommendations.json';

  const getRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (!getRes.ok) return res.status(500).json({ error: 'Failed to fetch recommendations' });
  const { sha, content: encoded } = await getRes.json();
  const current = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));

  current.pending.push({ text: text.trim(), submittedAt: new Date().toISOString() });

  const newContent = Buffer.from(JSON.stringify(current, null, 2)).toString('base64');
  const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: 'rec: new submission', content: newContent, sha }),
  });

  if (!putRes.ok) return res.status(500).json({ error: 'Failed to save' });

  if (process.env.DISCORD_WEBHOOK_URL) {
    try {
      const webhookRes = await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `<@524881167464267776> 📬 **New recommendation:**\n"${text.trim()}"\n\nUse \`/rec list\` to review.`,
        }),
      });
      if (!webhookRes.ok) {
        console.error('Discord webhook failed:', webhookRes.status, await webhookRes.text());
      }
    } catch (e) {
      console.error('Discord webhook error:', e.message);
    }
  }

  return res.status(200).json({ ok: true });
}
