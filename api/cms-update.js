export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { GITHUB_TOKEN, ADMIN_PASSWORD } = process.env;
  const REPO = 'kobulai/blog';
  const ALLOWED_FILES = ['data.json', 'daily.json', 'recommendations.json'];

  const { password, data, ping, file } = req.body;
  const FILE = ALLOWED_FILES.includes(file) ? file : 'data.json';

  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  if (ping) return res.status(200).json({ ok: true });
  if (!data) return res.status(400).json({ error: 'No data provided' });

  if (FILE === 'daily.json') {
    data.date = new Date().toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Australia/Sydney',
    });
  }

  const getRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (!getRes.ok) return res.status(500).json({ error: 'Failed to fetch file from GitHub' });
  const { sha } = await getRes.json();

  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const updateRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: 'cms: update content', content, sha }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.json();
    return res.status(500).json({ error: 'GitHub commit failed', detail: err });
  }

  return res.status(200).json({ ok: true });
}
