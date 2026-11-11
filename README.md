# my-downloader-api

YouTube audio/video downloader API (Vercel serverless, Node.js). Bot ke `play`/`song` command jaise hi kaam karta hai.

## Endpoints

| Endpoint | Kaam | Example |
| --- | --- | --- |
| `GET /api/ytmp3` | Audio (mp3) download link | `/api/ytmp3?apikey=KEY&url=https://youtu.be/xxxx` |
| `GET /api/ytmp4` | Video (mp4) download link | `/api/ytmp4?apikey=KEY&url=https://youtu.be/xxxx` |

## Response

```json
{
  "status": true,
  "result": {
    "title": "Song name",
    "thumbnail": "https://...",
    "duration": 210,
    "quality": "128kbps",
    "downloadUrl": "https://..."
  }
}
```

Yeh shape bilkul `play.js` ke `data.status` + `data.result.downloadUrl` se match karta hai.

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

Deploy ke baad Vercel Dashboard → Project → Settings → Environment Variables me `API_KEY` add karo, phir dobara deploy karo.

## Bot me kaise use kare

`commands/play.js` me:

```js
const response = await axios.get(
  `https://your-project.vercel.app/api/ytmp3?apikey=YOUR_KEY&url=${urlYt}`
);
const data = response.data;
if (!data.status || !data.result?.downloadUrl) throw new Error('API failed');
```

## Zaroori note: IP-lock problem

`ytdl-core` jo `downloadUrl` deta hai woh `googlevideo.com` ka hota hai aur **aapke server IP ke liye locked** hota hai. Bot ke user ke phone se direct download fail ho sakta hai.

Isliye bot me `lib/api.js` ke `isIpLockedCdn` check ki tarah guard rakho, ya production me yeh options use karo:

- **Stream proxy**: file ko server se stream karke ek apna URL do (Vercel par response size limit ka dhyan rakho).
- **yt-dlp (VPS)**: server par `yt-dlp` se download karke apni storage se serve karo — sabse reliable.
