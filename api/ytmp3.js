const { handle } = require('./_lib');

// GET /api/ytmp3?apikey=KEY&url=<youtube_url>
module.exports = (req, res) => handle(req, res, 'audio');
