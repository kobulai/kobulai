export const config = { api: { bodyParser: false } };

const REPO = 'kobulai/blog';

function fromHex(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));
}

async function verifySignature(req, rawBody) {
  const sig = req.headers['x-signature-ed25519'];
  const ts  = req.headers['x-signature-timestamp'];
  if (!sig || !ts) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw', fromHex(process.env.DISCORD_PUBLIC_KEY),
      { name: 'Ed25519' }, false, ['verify']
    );
    return crypto.subtle.verify(
      'Ed25519', key, fromHex(sig),
      new TextEncoder().encode(ts + rawBody)
    );
  } catch {
    return false;
  }
}

async function getRawBody(req) {
  if (req.body !== undefined) {
    return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function ghGet(file) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${file}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
  });
  const j = await r.json();
  return {
    data: JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')),
    sha: j.sha,
  };
}

async function ghPut(file, data, sha, message) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${file}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
      sha,
    }),
  });
  if (!r.ok) throw new Error(`GitHub PUT failed: ${r.status}`);
}

function reply(content, ephemeral = true) {
  return {
    type: 4,
    data: { content, flags: ephemeral ? 64 : 0 },
  };
}

function opt(options, name) {
  return options?.find(o => o.name === name)?.value ?? '';
}

async function handleRec(sub, subOptions) {
  const { data, sha } = await ghGet('recommendations.json');

  if (sub === 'list') {
    if (!data.pending?.length) return reply('📭 No pending recommendations.');
    const lines = data.pending.map((r, i) => {
      const date = new Date(r.submittedAt).toLocaleDateString('en-GB');
      return `**${i + 1}.** "${r.text}" — _${date}_`;
    }).join('\n');
    return reply(`📬 **Pending (${data.pending.length}):**\n${lines}`);
  }

  const idx = (opt(subOptions, 'index') ?? 1) - 1;
  if (idx < 0 || idx >= (data.pending?.length ?? 0)) {
    return reply('❌ Invalid index — use `/rec list` to see numbers.');
  }
  const [rec] = data.pending.splice(idx, 1);

  if (sub === 'approve') {
    if (!data.approved) data.approved = [];
    data.approved.push({ ...rec, approvedAt: new Date().toISOString() });
    data.latest = rec.text;
    await ghPut('recommendations.json', data, sha, 'rec: approve via discord');
    return reply(`✅ Approved and set as latest:\n"${rec.text}"`);
  }

  if (sub === 'deny') {
    await ghPut('recommendations.json', data, sha, 'rec: deny via discord');
    return reply(`🗑️ Denied:\n"${rec.text}"`);
  }

  return reply('Unknown subcommand.');
}

async function handleDaily(options) {
  const title = opt(options, 'title');
  const embed = opt(options, 'embed');
  const note  = opt(options, 'note');

  const { data, sha } = await ghGet('daily.json');
  data.title = title;
  data.embed = embed;
  if (note) data.note = note;
  else delete data.note;

  await ghPut('daily.json', data, sha, 'daily: update via discord');
  return reply(`📅 Post of the day updated!\n**${title}**${note ? `\n_${note}_` : ''}\n${embed}`);
}

async function handleInterest(subOptions) {
  const category = opt(subOptions, 'category');
  const text     = opt(subOptions, 'text');
  const note     = opt(subOptions, 'note');
  const image    = opt(subOptions, 'image');
  const link     = opt(subOptions, 'link');

  if (!category || !text) return reply('❌ Missing category or text.');

  const { data, sha } = await ghGet('data.json');
  if (!data.interests) data.interests = {};
  if (!data.interests[category]) data.interests[category] = [];

  const entry = {
    text,
    ...(note  && { note }),
    ...(image && { image }),
    ...(link  && { link }),
  };
  data.interests[category].unshift(entry);

  await ghPut('data.json', data, sha, `interests: add ${category} via discord`);
  return reply(`✅ Added to **${category}**:\n"${text}"${note ? `\n_${note}_` : ''}${link ? `\n${link}` : ''}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);

  if (!(await verifySignature(req, rawBody))) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const body = JSON.parse(rawBody);

  if (body.type === 1) return res.json({ type: 1 });

  if (body.type === 2) {
    const { name, options = [] } = body.data;

    try {
      let result;

      if (name === 'rec') {
        const sub        = options[0]?.name;
        const subOptions = options[0]?.options ?? [];
        result = await handleRec(sub, subOptions);

      } else if (name === 'daily') {
        result = await handleDaily(options);

      } else if (name === 'interest') {
        const subOptions = options[0]?.options ?? [];
        result = await handleInterest(subOptions);

      } else {
        result = reply('❓ Unknown command.');
      }

      return res.json(result);
    } catch (e) {
      console.error('[discord-interactions]', e);
      return res.json(reply(`❌ Error: ${e.message}`));
    }
  }

  res.status(400).end();
}
