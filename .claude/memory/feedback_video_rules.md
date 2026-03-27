---
name: Video generation rules
description: Strict rules for video generation — no on-screen text, overlay→audio dialogue, use fal.ai not Veo
type: feedback
---

1. **No on-screen text** — videos must have ZERO text, titles, captions, watermarks, handles, or logos
2. **"overlay" → "audio dialogue"** — replace in visual descriptions before sending to video gen
3. **Use fal.ai LTX v2.3** — NOT Google Veo. Veo 3 has 10/day limit, Veo 2 has no audio. LTX is cheaper with audio.
4. **Dialogue max 8 seconds** — video duration set to 8s
5. **Strip text instructions** from visual descriptions before sending to video model (regex strips Text:, Title:, Caption:, quoted strings, "with text...")

**Why:** Veo was too expensive ($1.20-2.80/video) and had tight rate limits (429 errors). Videos kept rendering on-screen text despite instructions not to. User wants purely visual videos with ambient audio only.
