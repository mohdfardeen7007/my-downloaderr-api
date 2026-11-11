# my-downloader-api

Self-hosted YouTube audio/video downloader API (Vercel serverless, Node.js). Bot ke `play`/`song` command jaise hi kaam karta hai.

**Koi third-party downloader API nahi** — server khud YouTube se extract karta hai, isliye kisi ki daily limit ka issue nahi.

## Endpoints

| Endpoint | Kaam | Example |
| --- | --- | --- |
| `GET /api/ytmp3` | Audio (m4a 128kbps) download link | `/api/ytmp3?apikey=KEY&url=https://youtu.be/xxxx` |
| `GET /api/ytmp4` | Video (mp4, progressive) download link | `/api/ytmp4?apikey=KEY&url=https://youtu.be/xxxx` |

## Response

```json
{
  "status": true,
  "result": {
    "title": "Song name",
    "thumbnail": "https://...",
    "duration": 213,
    "source": "YouTube",
    "quality": "128kbps",
    "type": "audio",
    "downloadUrl": "https://..."
  }
}
```

Yeh shape bilkul `play.js` ke `data.status` + `data.result.downloadUrl` se match karta hai.

## Error response

Fail hone par saaf message milta hai (`detail` me technical error hota hai):

```json
{
  "status": false,
  "result": {
    "error": "Yeh video private hai ya available nahi hai.",
    "detail": "Video unavailable"
  }
}
```

| Error | Matlab |
| --- | --- |
| `Yeh video private hai ya available nahi hai.` | Video delete/private/region-locked |
| `YouTube ne request block kar di. Thodi der baad try karo.` | YouTube ne is IP ko block kiya (bot-detection) |
| `Live stream download nahi ho sakti.` | Live/premiere video |
| `Server slow hai. Thodi der baad try karo.` | Timeout / network issue |

## Kaise kaam karta hai

Server `@distube/ytdl-core` se seedha YouTube se audio/video format nikalta hai aur uska direct URL deta hai.

- **Audio**: m4a (itag 140, 128kbps) — WhatsApp/bot ke liye sabse compatible
- **Video**: progressive format (audio+video ek hi file) — isliye ffmpeg ki zarurat nahi

## Environment Variables

| Name | Default | Kaam |
| --- | --- | --- |
| `API_KEY` | — (required) | Aapki API ko protect karta hai |

## Local test

```bash
npm install
cp .env.example .env        # API_KEY set karo
npm run dev                 # vercel dev se local server chalega
```

## Deploy (Vercel)

```bash
npm i -g vercel
vercel login
vercel --prod
```

Deploy ke baad Vercel Dashboard → Project → Settings → Environment Variables me `API_KEY` add karo, phir redeploy karo.

## Bot me kaise use kare

`commands/play.js` me:

```js
const response = await axios.get(
  `https://your-project.vercel.app/api/ytmp3?apikey=YOUR_KEY&url=${urlYt}`
);
const data = response.data;
if (!data.status || !data.result?.downloadUrl) throw new Error(data.result?.error || 'API failed');
```
