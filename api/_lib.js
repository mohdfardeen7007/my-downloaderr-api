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

async function handle(req, res, type) {
  if (!requireAuth(req, res)) return;

  const { url } = req.query;
  if (!url || !ytdl.validateURL(url)) {
    return json(res, 400, false, { error: 'Invalid YouTube URL' });
  }

  try {
    const info = await ytdl.getInfo(url);

    const format =
      type === 'audio'
        ? ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
        : ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'audioandvideo' });

    if (!format || !format.url) {
      return json(res, 422, false, { error: 'No downloadable format found' });
    }

    return json(res, 200, true, {
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails.at(-1)?.url || null,
      duration: Number(info.videoDetails.lengthSeconds) || 0,
      quality: type === 'audio' ? `${format.audioBitrate || 128}kbps` : `${format.qualityLabel || 'video'}`,
      downloadUrl: format.url,
    });
  } catch (e) {
    return json(res, 500, false, { error: e.message });
  }
}

module.exports = { handle };
