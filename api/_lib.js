const axios = require('axios');

const API_KEY = process.env.API_KEY || '';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Ek jaisa response shape jo bot (play.js) already expect karta hai
function json(res, code, status, result) {
  res.status(code).json({ status, result });
}

// API key check — key .env / Vercel env se aati hai
function requireAuth(req, res) {
  const { apikey } = req.query;
  if (!API_KEY) {
    json(res, 500, false, { error: 'Server API_KEY not configured' });
    return false;
  }
  if (apikey !== API_KEY) {
    json(res, 401, false, { error: 'Invalid API key' });
    return false;
  }
  return true;
}

function isHttp(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

// googlevideo links IP-locked hote hain (server IP ke liye) — reject karo
function isIpLocked(u) {
  return /googlevideo\.com|youtube\.com\/videoplayback/i.test(String(u || ''));
}

function toWatchUrl(input) {
  const t = String(input || '').trim();
  const m =
    t.match(/(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i) ||
    t.match(/^([a-zA-Z0-9_-]{11})$/);
  return m?.[1] ? `https://www.youtube.com/watch?v=${m[1]}` : t;
}

const enc = encodeURIComponent;

// Har provider: endpoint(url) + pick(response) -> {downloadUrl, title, thumbnail}
const AUDIO_PROVIDERS = [
  {
    name: 'Keith',
    endpoint: (u) => `https://apis-keith.vercel.app/download/dlmp3?url=${enc(u)}`,
    pick: (d) =>
      d?.status && d?.result?.downloadUrl
        ? { downloadUrl: d.result.downloadUrl, title: d.result.title }
        : null,
  },
  {
    name: 'Prince',
    endpoint: (u) => `https://api.princetechn.com/api/download/ytmp3?apikey=prince&url=${enc(u)}`,
    pick: (d) => {
      const r = d?.result || d;
      const dl = r?.downloadUrl || r?.download || r?.dl_url;
      return dl ? { downloadUrl: dl, title: r?.title, thumbnail: r?.thumbnail } : null;
    },
  },
  {
    name: 'Prexzy',
    endpoint: (u) => `https://prexzyapis.com/download/ytmp3?url=${enc(u)}`,
    pick: (d) =>
      d?.download_url
        ? { downloadUrl: d.download_url, title: d.info?.title, thumbnail: d.info?.thumbnail }
        : null,
  },
  {
    name: 'Yupra',
    endpoint: (u) => `https://api.yupra.my.id/api/downloader/ytmp3?url=${enc(u)}`,
    pick: (d) =>
      d?.success && d?.data?.download_url
        ? { downloadUrl: d.data.download_url, title: d.data.title, thumbnail: d.data.thumbnail }
        : null,
  },
  {
    name: 'Okatsu',
    endpoint: (u) => `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${enc(u)}`,
    pick: (d) => (d?.dl ? { downloadUrl: d.dl, title: d.title, thumbnail: d.thumb } : null),
  },
  {
    name: 'EliteProTech',
    endpoint: (u) => `https://eliteprotech-apis.zone.id/ytdown?url=${enc(u)}&format=mp3`,
    pick: (d) => (d?.success && d?.downloadURL ? { downloadUrl: d.downloadURL, title: d.title } : null),
  },
];

const VIDEO_PROVIDERS = [
  {
    name: 'Prince',
    endpoint: (u) =>
      `https://api.princetechn.com/api/download/ytvideo?apikey=prince&quality=720&url=${enc(u)}`,
    pick: (d) => {
      const r = d?.result || d;
      const dl = r?.downloadUrl || r?.download_url || r?.video;
      return dl ? { downloadUrl: dl, title: r?.title, thumbnail: r?.thumbnail } : null;
    },
  },
  {
    name: 'Yupra',
    endpoint: (u) => `https://api.yupra.my.id/api/downloader/ytmp4?url=${enc(u)}`,
    pick: (d) =>
      d?.success && d?.data?.download_url
        ? { downloadUrl: d.data.download_url, title: d.data.title, thumbnail: d.data.thumbnail }
        : null,
  },
  {
    name: 'Okatsu',
    endpoint: (u) => `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${enc(u)}`,
    pick: (d) =>
      d?.result?.mp4
        ? { downloadUrl: d.result.mp4, title: d.result.title, thumbnail: d.result.thumb }
        : null,
  },
  {
    name: 'EliteProTech',
    endpoint: (u) => `https://eliteprotech-apis.zone.id/ytdown?url=${enc(u)}&format=mp4`,
    pick: (d) => (d?.success && d?.downloadURL ? { downloadUrl: d.downloadURL, title: d.title } : null),
  },
];

// Providers ko ek-ek karke try karo, pehla working wala return karo
async function tryProviders(providers, input) {
  const target = toWatchUrl(input);
  let lastError = 'All providers failed';

  for (const p of providers) {
    try {
      const { data } = await axios.get(p.endpoint(target), {
        timeout: 20000,
        validateStatus: () => true,
        headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
      });

      const r = p.pick(data);
      if (!r || !isHttp(r.downloadUrl)) throw new Error('no download URL');
      if (isIpLocked(r.downloadUrl)) throw new Error('IP-locked googlevideo URL');

      return { ...r, source: p.name };
    } catch (e) {
      lastError = `${p.name}: ${e.message}`;
      console.log('[provider]', lastError);
    }
  }
  throw new Error(lastError);
}

async function handle(req, res, type) {
  if (!requireAuth(req, res)) return;

  const { url } = req.query;
  if (!url) {
    return json(res, 400, false, { error: 'Missing youtube url param' });
  }

  try {
    const r = await tryProviders(type === 'video' ? VIDEO_PROVIDERS : AUDIO_PROVIDERS, url);
    return json(res, 200, true, {
      title: r.title || 'YouTube',
      thumbnail: r.thumbnail || null,
      type: type === 'video' ? 'video' : 'audio',
      source: r.source,
      downloadUrl: r.downloadUrl,
    });
  } catch (e) {
    return json(res, 502, false, { error: e.message });
  }
}

module.exports = { handle };
