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
    "duration": 213,
    "type": "audio",
    "source": "Knight",
    "downloadUrl": "https://..."
  }
}
```

Yeh shape bilkul `play.js` ke `data.status` + `data.result.downloadUrl` se match karta hai.

## Kaise kaam karta hai

Server khud YouTube se extract nahi karta (cloud IPs YouTube block karta hai). Isliye yeh API ek
**working downloader API ko call karta hai** aur uska result aapke bot ko de deta hai:

- **Primary**: Knight API — `KNIGHT_API_URL` (default `https://knightbotapi.stream`), `KNIGHT_API_KEY` (default `knight`)
- **Fallback (audio)**: Prexzy

`googlevideo.com` waale (IP-locked) links automatically reject ho jate hain.

## Environment Variables

| Name | Default | Kaam |
| --- | --- | --- |
| `API_KEY` | — (required) | Aapki API ko protect karta hai |
| `KNIGHT_API_URL` | `https://knightbotapi.stream` | Primary provider base URL |
| `KNIGHT_API_KEY` | `knight` | Primary provider key |

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

Deploy ke baad Vercel Dashboard → Project → Settings → Environment Variables me `API_KEY` (aur chaho to `KNIGHT_API_URL`/`KNIGHT_API_KEY`) add karo, phir redeploy karo.

## Bot me kaise use kare

`commands/play.js` me:

```js
const response = await axios.get(
  `https://your-project.vercel.app/api/ytmp3?apikey=YOUR_KEY&url=${urlYt}`
);
const data = response.data;
if (!data.status || !data.result?.downloadUrl) throw new Error('API failed');
```
