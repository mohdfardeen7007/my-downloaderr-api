// Self-hosted YouTube downloader API (Vercel serverless).
// youtubei.js (InnerTube) se seedha YouTube se extract karta hai —
// koi third-party API nahi, isliye kisi ki daily limit ka issue nahi.
//
// NOTE: googlevideo ke URLs usi IP se chalte hain jisne unhe generate kiya.
// Isliye download hum apne hi server se stream karte hain (/api/dl),
// warna bot ke IP se official URL 403 de deta hai.

const API_KEY = process.env.API_KEY || '';

// Kaunse client se URL milega (kuch clients SABR-only dete hain, koi URL nahi).
// Kuch clients ka URL ban to jaata hai par fetch par 403 deta hai, isliye
// download ke waqt har client ka URL generate + fetch dono try hote hain.
const CLIENT_PLAN = {
  audio: ['IOS', 'VISIONOS', 'ANDROID_VR', 'ANDROID'],
  video: ['IOS', 'VISIONOS', 'ANDROID', 'ANDROID_VR'],
};
const META_CLIENTS = ['ANDROID_VR', 'IOS', 'ANDROID', 'VISIONOS', 'TV_SIMPLY'];

// Ek jaisa response shape jo bot (play.js) already expect karta hai
function json(res, code, status, result) {
  if (typeof res.status === 'function') return res.status(code).json({ status, result });
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ status, result }));
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

// Kisi bhi YouTube URL / ID se 11-char video id nikalta hai
function toVideoId(input) {
  const t = String(input || '').trim();
  const m =
    t.match(/(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i) ||
    t.match(/^([a-zA-Z0-9_-]{11})$/);
  return m?.[1] || null;
}

// Request ka public base URL (Vercel proxy headers se)
function baseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return `${proto}://${host}`;
}

// Technical error ko bot/user ke liye saaf message me badalta hai
function friendlyError(message) {
  const m = String(message || '');
  if (/private|unavailable|not available|removed|deleted|no longer|does not exist|unplayable/i.test(m))
    return 'Yeh video private hai ya available nahi hai.';
  if (/sign in|not a bot|captcha|confirm|login required|bot/i.test(m))
    return 'YouTube ne request block kar di. Thodi der baad try karo.';
  if (/age.?restrict/i.test(m)) return 'Yeh video age-restricted hai.';
  if (/live|premiere|upcoming/i.test(m)) return 'Live stream download nahi ho sakti.';
  if (/no matching formats|streaming data not available|no such format|decipher|no valid url/i.test(m))
    return 'Yeh video ka downloadable format nahi mila.';
  if (/duration|too long/i.test(m)) return 'Video bahut lamba hai (max 10 minute).';
  if (/timeout|timedout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|network|fetch failed/i.test(m))
    return 'Server slow hai. Thodi der baad try karo.';
  return 'Download fail hua. Thodi der baad try karo.';
}

// Innertube client — module-level cache, warm invocations me reuse hota hai
let clientPromise = null;
function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { Innertube } = await import('youtubei.js');
      return Innertube.create({ retrieve_player: true, lang: 'en', location: 'US' });
    })();
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

// Ek client ke saath video info (basic_info / streaming_data) laata hai
async function getInfo(videoId, client) {
  const yt = await getClient();
  const opts = client ? { client } : undefined;
  let info;
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      info = await yt.getBasicInfo(videoId, opts);
      const status = info.playability_status?.status;
      if (status && status !== 'OK') break; // definitive error — retry se fayda nahi
      if (info.streaming_data) break; // sab mil gaya
    } catch (e) {
      lastErr = e;
    }
  }
  if (!info) throw lastErr || new Error('Failed to fetch video info');
  return { yt, info };
}

// playability + live check — dono metadata aur download me use hota hai
function assertPlayable(info) {
  const status = info.playability_status?.status;
  if (status && status !== 'OK') throw new Error(info.playability_status?.reason || status);
  const basic = info.basic_info || {};
  if (basic.is_live || basic.is_live_content) throw new Error('live stream');
  if (basic.is_upcoming) throw new Error('upcoming premiere');
  if (!basic.title) throw new Error('This video is unavailable');
  return basic;
}

// Sabse badi thumbnail chuno
function bestThumbnail(thumbs) {
  if (!Array.isArray(thumbs) || thumbs.length === 0) return null;
  const sorted = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0));
  return sorted[0]?.url || null;
}

// Ek client ke saath googlevideo se download stream kholta hai (youtubei.js ke through).
// youtubei.js khud `cpn` (client playback nonce) + YouTube ka `range` param lagata hai,
// jisse `n`-param throttling (beech me stall) nahi hoti. Pehla chunk yahin read karte hain
// taake kharab client (403/error) turant skip ho jaaye.
async function openDownloadStream(videoId, type) {
  const clients = CLIENT_PLAN[type] || CLIENT_PLAN.audio;
  const yt = await getClient();
  let lastErr = null;
  for (const client of clients) {
    try {
      const stream = await yt.download(videoId, {
        type: type === 'video' ? 'video+audio' : 'audio',
        quality: 'best',
        format: 'mp4',
        client,
      });
      const reader = stream.getReader();
      const first = await reader.read();
      return { reader, first };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('No playable format found');
}

// Metadata endpoint (/api/ytmp3, /api/ytmp4) — sirf info, downloadUrl apne /api/dl par
async function handle(req, res, type) {
  if (!requireAuth(req, res)) return;

  const { url } = req.query;
  if (!url) return json(res, 400, false, { error: 'Missing youtube url param' });
  const videoId = toVideoId(url);
  if (!videoId) return json(res, 400, false, { error: 'Invalid YouTube url/id' });

  try {
    let basic;
    let lastErr;
    for (const client of META_CLIENTS) {
      try {
        const { info } = await getInfo(videoId, client);
        basic = assertPlayable(info);
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!basic) throw lastErr || new Error('Failed to fetch video info');

    const downloadUrl = `${baseUrl(req)}/api/dl?apikey=${encodeURIComponent(API_KEY)}&v=${videoId}&type=${type === 'video' ? 'video' : 'audio'}`;

    return json(res, 200, true, {
      title: basic.title,
      thumbnail: bestThumbnail(basic.thumbnail),
      duration: Number(basic.duration) || 0,
      source: 'YouTube',
      quality: type === 'video' ? 'video' : 'audio',
      type: type === 'video' ? 'video' : 'audio',
      downloadUrl,
    });
  } catch (e) {
    console.log('[ytmp] error:', e?.message || e);
    return json(res, 502, false, { error: friendlyError(e?.message), detail: String(e?.message || e) });
  }
}

// backpressure-aware write
function writeChunk(res, buf) {
  return new Promise((resolve, reject) => {
    if (res.write(buf)) return resolve();
    res.once('drain', resolve);
    res.once('error', reject);
  });
}

// Download endpoint (/api/dl) — YouTube se bytes laakar bot ko stream karta hai.
// Appne hi IP se fetch hota hai, isliye googlevideo ka IP-lock pass ho jata hai.
async function handleDownload(req, res) {
  if (!requireAuth(req, res)) return;

  const type = req.query.type === 'video' ? 'video' : 'audio';
  const videoId = toVideoId(req.query.v || req.query.url);
  if (!videoId) return json(res, 400, false, { error: 'Invalid YouTube url/id' });

  try {
    // Har client par fresh download stream (kharab client skip). 2 baar poori koshish.
    let opened = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 2 && !opened; attempt++) {
      try {
        opened = await openDownloadStream(videoId, type);
      } catch (e) {
        lastErr = e;
      }
    }
    if (!opened) throw lastErr || new Error('No playable format found');

    const { reader, first } = opened;
    res.statusCode = 200;
    res.setHeader('Content-Type', type === 'video' ? 'video/mp4' : 'audio/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.${type === 'video' ? 'mp4' : 'm4a'}"`);

    if (!first.done && first.value) await writeChunk(res, Buffer.from(first.value));
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writeChunk(res, Buffer.from(value));
    }
    res.end();
  } catch (e) {
    console.log('[dl] error:', e?.message || e);
    if (!res.headersSent) {
      return json(res, 502, false, { error: friendlyError(e?.message), detail: String(e?.message || e) });
    }
    res.end();
  }
}

module.exports = { handle, handleDownload };
