# my-downloader-api

Self-hosted YouTube audio/video downloader API (Vercel serverless, Node.js). Bot ke `play`/`song` command jaise hi kaam karta hai.

**Koi third-party downloader API nahi** — server khud YouTube se extract karta hai, isliye kisi ki daily limit ka issue nahi.

## Endpoints

| Endpoint | Kaam | Example |
| --- | --- | --- |
| `GET /api/ytmp3` | Audio info + download link | `/api/ytmp3?apikey=KEY&url=https://youtu.be/xxxx` |
| `GET /api/ytmp4` | Video info + download link | `/api/ytmp4?apikey=KEY&url=https://youtu.be/xxxx` |
| `GET /api/dl` | Actual media stream (downloader) | `/api/ytmp3` se mila `downloadUrl` |

Asli file `/api/dl` se aati hai — bot usi `downloadUrl` ko download karta hai.

## Response

```json
{
  "status": true,
  "result": {
    "title": "Song name",
    "thumbnail": "https://...",
    "duration": 213,
    "source": "YouTube",
    "quality": "audio",
    "type": "audio",
    "downloadUrl": "https://your-project.vercel.app/api/dl?apikey=KEY&v=VIDEOID&type=audio"
  }
}
```

Yeh shape bilkul `play.js` ke `data.status` + `data.result.downloadUrl` se match karta hai.
(`downloadUrl` hamare hi `/api/dl` par point karta hai — neeche wajah likhi hai.)

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

Server `youtubei.js` (YouTube InnerTube) se seedha YouTube se format nikalta hai.

- **Audio**: m4a (itag 140, ~128kbps) — WhatsApp/bot ke liye sabse compatible
- **Video**: progressive format (audio+video ek hi file, aam taur par 360p) — isliye ffmpeg ki zarurat nahi
- Client fallback: kuch YouTube clients sirf SABR-only data dete hain jisme direct URL nahi hota, isliye har type ke liye kai clients try kiye jaate hain.

### Download `/api/dl` se kyun hota hai?

YouTube ke `googlevideo.com` URLs **usi IP se chalti hain jisne unhe banaya** — kisi doosre IP se fetch karo to `403`. Bot apni machine se download karta hai (alag IP), isliye:

1. `/api/ytmp3` sirf info deta hai aur `downloadUrl` hamare `/api/dl` par bhejta hai.
2. Jab bot `/api/dl` hit karta hai, hum **usi request me** YouTube se fresh URL banate hain aur wahi se bytes laakar bot ko stream kar dete hain (IP match ho jaata hai).

Isliye direct `googlevideo` URL return nahi karte — wo bot ke IP par fail hota hai.

## Environment Variables

| Name | Default | Kaam |
| --- | --- | --- |
| `API_KEY` | — (required) | Aapki API ko protect karta hai |

> **Cookies kyun nahi?** Logged-in account cookies add karne par YouTube zyada videos par
> *"Video unavailable"* deta hai (account-specific block), jabki anonymous extraction
> zyada videos par chalti hai. Isliye API jaan-boojh kar bina cookie chalti hai.

`YT_COOKIE` env agar Vercel par set hai to usse **delete** kar do (ab use nahi hoti).

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
