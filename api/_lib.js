const ytdl = require('@distube/ytdl-core');

const API_KEY = process.env.API_KEY || '';

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

function toWatchUrl(input) {
  const t = String(input || '').trim();
  const m =
    t.match(/(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i) ||
    t.match(/^([a-zA-Z0-9_-]{11})$/);
  return m?.[1] ? `https://www.youtube.com/watch?v=${m[1]}` : t;
}

// Technical error ko bot/user ke liye saaf message me badalta hai
function friendlyError(message) {
  const m = String(message || '');
  if (/private|unavailable|not available|removed|deleted|no longer|does not exist/i.test(m))
    return 'Yeh video private hai ya available nahi hai.';
  if (/sign in|not a bot|captcha|confirm/i.test(m))
    return 'YouTube ne request block kar di. Thodi der baad try karo.';
  if (/age.?restrict/i.test(m)) return 'Yeh video age-restricted hai.';
  if (/live|premiere|upcoming/i.test(m)) return 'Live stream download nahi ho sakti.';
  if (/no progressive video format/i) return 'Yeh video ka downloadable format nahi mila.';
  if (/duration|too long/i.test(m)) return 'Video bahut lamba hai (max 10 minute).';
  if (/timeout|timedout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|network/i.test(m))
    return 'Server slow hai. Thodi der baad try karo.';
  return 'Download fail hua. Thodi der baad try karo.';
}

// YouTube se seedha extract — koi third-party API nahi, koi limit nahi
async function youtubeDownload(url, type) {
  const info = await ytdl.getInfo(url);
  const details = info.videoDetails;

  if (details.isLiveContent) throw new Error('live stream');

  const audioOnly = info.formats.filter((f) => f.hasAudio && !f.hasVideo);
  const progressive = info.formats.filter((f) => f.hasAudio && f.hasVideo);

  let format;
  if (type === 'video') {
    // Progressive (audio+video ek hi file) — ffmpeg ki zarurat nahi
    if (!progressive.length) throw new Error('no progressive video format');
    format = ytdl.chooseFormat(progressive, { quality: 'highest' });
  } else {
    if (!audioOnly.length) throw new Error('no audio format');
    // m4a (mp4 container) sabse zyada compatible — WhatsApp/bot ke liye best
    format = audioOnly
      .filter((f) => (f.mimeType || '').includes('mp4'))
      .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0];
    if (!format) format = ytdl.chooseFormat(audioOnly, { quality: 'highestaudio' });
  }

  const thumbs = details.thumbnails || [];

  return {
    title: details.title,
    thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null,
    duration: Number(details.lengthSeconds) || 0,
    source: 'YouTube',
    quality: format.qualityLabel || (format.audioBitrate ? `${format.audioBitrate}kbps` : null),
    downloadUrl: format.url,
  };
}

async function handle(req, res, type) {
  if (!requireAuth(req, res)) return;

  const { url } = req.query;
  if (!url) {
    return json(res, 400, false, { error: 'Missing youtube url param' });
  }

  const target = toWatchUrl(url);

  try {
    const r = await youtubeDownload(target, type);
    return json(res, 200, true, { ...r, type: type === 'video' ? 'video' : 'audio' });
  } catch (e) {
    console.log('[ytdl] error:', e.message);
    return json(res, 502, false, { error: friendlyError(e.message), detail: e.message });
  }
}

module.exports = { handle };
