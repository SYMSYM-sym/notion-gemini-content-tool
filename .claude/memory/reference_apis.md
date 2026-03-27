---
name: API keys and service references
description: Where API keys come from and service endpoints used by the project
type: reference
---

- **Gemini API Key**: From Google AI Studio (https://aistudio.google.com/apikey) — Paid Tier 1
- **fal.ai API Key**: From fal.ai dashboard — used for LTX v2.3 video generation
- **Vercel Blob**: Token from Vercel project Storage tab — store name "notion-images"
- **Notion**: Public page scraping, no API key needed. Primary: splitbee proxy, fallback: notion-client
- **Vercel**: Account smsymsym, project notion-gemini-content-tool, connected to GitHub
- **GitHub**: SYMSYM-sym/notion-gemini-content-tool, main branch

### fal.ai LTX v2.3 endpoint
- Model: `fal-ai/ltx-2.3/text-to-video`
- SDK: `@fal-ai/client` npm package
- Params: prompt, duration (6/8/10), resolution (1080p/1440p/2160p), aspect_ratio (16:9/9:16), fps (24/25/48/50), generate_audio (true/false)

### Gemini models in use
- Image generation: `gemini-2.5-flash-image` (responseModalities: ['TEXT', 'IMAGE'])
- Image verification: `gemini-2.5-flash`
- Fallback image: `gemini-2.0-flash`
