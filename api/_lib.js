const axios = require('axios');

const API_KEY = process.env.API_KEY || '';
const KNIGHT_URL = (process.env.KNIGHT_API_URL || 'https://knightbotapi.stream').replace(/\/$/, '');
const KNIGHT_KEY = process.env.KNIGHT_API_KEY || 'knight';
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

// googlevideo links server IP ke liye locked hote hain — reject karo
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

// Primary: Knight API (savetube CDN par direct link deta hai — non IP-locked)
async function knightDownload(url, type) {
  const endpoint = type === 'video' ? 'ytmp4' : 'ytaudio';
  const format = type === 'video' ? '720p' : '128kbps';

  const { data } = await axios.get(`${KNIGHT_URL}/api/download/${endpoint}`, {
    params: { apikey: KNIGHT_KEY, format, url },
    timeout: 60000,
    validateStatus: () => true,
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });

  const r = data?.result;
  const dl = r?.download || r?.downloadUrl;

  if (!data?.success || !isHttp(dl)) {
    throw new Error(data?.error || data?.message || 'Knight API returned no download URL');
  }
  if (isIpLocked(dl)) {
    throw new Error('Knight API returned an IP-locked URL');
  }

  return {
    title: r?.title,
    thumbnail: r?.thumbnail || null,
    duration: Number(r?.duration) || 0,
    source: 'Knight',
    downloadUrl: dl,
  };
}

// Fallback: Prexzy (audio). googlevideo deta hai to filter ho jayega.
async function prexzyDownload(url) {
  const { data } = await axios.get('https://prexzyapis.com/download/ytmp3', {
    params: { url },
    timeout: 30000,
    validateStatus: () => true,
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  const dl = data?.download_url;
  if (!data?.status || !isHttp(dl)) throw new Error('Prexzy returned no download URL');
  if (isIpLocked(dl)) throw new Error('Prexzy returned an IP-locked URL');
  return {
    title: data?.info?.title,
    thumbnail: data?.info?.thumbnail || null,
    duration: Number(data?.info?.duration) || 0,
    source: 'Prexzy',
    downloadUrl: dl,
  };
}

async function handle(req, res, type) {
  if (!requireAuth(req, res)) return;

  const { url } = req.query;
  if (!url) {
    return json(res, 400, false, { error: 'Missing youtube url param' });
  }

  const target = toWatchUrl(url);
  const chain =
    type === 'video'
      ? [() => knightDownload(target, 'video')]
      : [() => knightDownload(target, 'audio'), () => prexzyDownload(target)];

  let lastError = 'All providers failed';
  for (const run of chain) {
    try {
      const r = await run();
      return json(res, 200, true, { ...r, type: type === 'video' ? 'video' : 'audio' });
    } catch (e) {
      lastError = e.message;
      console.log('[provider]', lastError);
    }
  }

  return json(res, 502, false, { error: lastError });
}

module.exports = { handle };
