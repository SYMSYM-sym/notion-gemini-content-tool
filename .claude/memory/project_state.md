---
name: Project State & Full Context
description: Complete state of the Notion Gemini Content Tool project — architecture, decisions, current issues, and deployment info. Use this to continue work seamlessly.
type: project
---

## Project: Notion Content Generator
A full-stack Next.js app that generates Instagram content images/videos from a Notion content calendar using Google Gemini (images) and fal.ai LTX v2.3 (videos).

**Live URL**: https://notion-gemini-content-tool.vercel.app
**GitHub**: https://github.com/SYMSYM-sym/notion-gemini-content-tool
**Branch**: main

## Tech Stack
- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Google Gemini `gemini-2.5-flash-image` for image generation
- Google Gemini `gemini-2.5-flash` for image verification
- fal.ai LTX v2.3 for video generation (with audio)
- Vercel Blob for approved image/video storage
- notion-client for public Notion database scraping
- Deployed on Vercel (smsymsym account)

## Environment Variables (on Vercel)
- `GEMINI_API_KEY` — Google AI Studio key
- `FAL_KEY` — fal.ai API key
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob store token
- `DEFAULT_NOTION_URL` — Default Notion database URL
- `NEXT_PUBLIC_DEFAULT_NOTION_URL` — Same, client-side

## Key Architecture Decisions

### Pipeline runs on CLIENT (not server)
The `usePipeline` hook orchestrates generate → verify → decide from the browser. Each step is a separate API call to avoid Vercel's function timeout.

### Image Generation Flow
1. Notion entry → `buildSlidePrompts()` analyzes content type (photo/graphic/carousel/video_cover/story)
2. For carousels: parses `[Slide N]` patterns and generates each slide separately
3. Sends to `/api/generate` → calls `gemini-2.5-flash-image` with `responseModalities: ['TEXT', 'IMAGE']`
4. Verification: sends generated image to `gemini-2.5-flash` to score 1-10
5. Score ≥ 7 → "passed" (awaits manual approval) → user approves → uploads to Vercel Blob
6. Score < 7 → retries up to 3 times with feedback, then flags for manual review

### Video Generation Flow
1. Entries with "video" or "reel" in contentType are routed to `processVideoEntry()`
2. Calls `/api/generate-video` → uses fal.ai `@fal-ai/client` SDK
3. Model: `fal-ai/ltx-2.3/text-to-video` with `generate_audio: true`
4. 8-second videos, 1080p, 9:16 aspect ratio for reels
5. Videos go to "passed" status (no AI verification) — user must approve manually
6. Cost: ~$0.15-0.30 per video

### Why we switched from Veo to fal.ai LTX v2.3
- Veo 3 Fast: only 10 videos/day, 2/min on Paid Tier 1 — caused 429 errors
- Veo 2: worked but no audio, $2.80/video
- LTX v2.3: audio included, ~$0.15-0.30/video, no tight quota

### Notion Scraping
- Primary: splitbee proxy (`https://notion-api.splitbee.io/v1/table/{id}`)
- Fallback: `notion-client` npm package (handles double-nested `value.value` structure)
- Database ID extracted from URL: `31904caee5bd809fa931d236c5d26d9a`
- `cache: 'no-store'` on all fetches + `Cache-Control: no-store` headers on API response
- Dashboard sorts entries by Day (smallest to largest)
- `pipeline.resetAll()` called on every new Notion load to prevent session bleed

### Prompts (lib/prompts.ts)
- All brand-specific references (@herhealthinfo, sage green/blush pink, "women's health") were REMOVED
- Prompts are now generic — they follow the visual direction from Notion exactly
- Video prompts: "overlay" → "audio dialogue", text instructions stripped
- Each content type has its own prompt builder: photo, graphic, carousel, video_cover, story

### File Naming Convention
Approved files stored as: `Day {N} - {Platform} - {Topic}.png` (or `.mp4` for video)
Carousels add: `- Slide {N}`

## Status Workflow
`pending` → `generating` → `verifying` → `passed` (awaits user approval) → `approved` (uploaded to blob)
`pending` → `generating` → `verifying` → `retrying` (up to 3x) → `needs_review` (flagged)
Video: `pending` → `generating` → `passed` (no verification) → `approved`

## File Structure
```
app/
  api/
    notion/route.ts       — GET: fetch Notion database
    generate/route.ts     — POST: generate image(s) with Gemini (maxDuration: 120)
    generate-video/route.ts — POST: generate video with fal.ai (maxDuration: 300)
    verify/route.ts       — POST: verify image with Gemini Vision (maxDuration: 30)
    approve/route.ts      — POST: upload to Vercel Blob (handles both image + video)
    download/route.ts     — GET: bulk download as zip
  layout.tsx, page.tsx, globals.css
components/
  Dashboard.tsx           — Main orchestrator
  EntryTable.tsx + EntryRow.tsx — Data table with live status
  StatusBadge.tsx         — Animated status badges (9 states including "passed")
  PipelineControls.tsx    — Generate All / Pause / Stop + progress
  PipelineLog.tsx         — Real-time activity log
  PreviewModal.tsx        — Image/video preview with approve/reject/regenerate/download
  ReviewQueue.tsx         — Manual review for flagged entries
  FilterBar.tsx           — Platform + status + search
  NotionUrlInput.tsx      — Notion URL input
  VerificationDetails.tsx — Score, feedback, missing/unwanted elements
lib/
  types.ts                — TypeScript interfaces
  notion.ts               — Notion scraping (splitbee + notion-client)
  gemini.ts               — Image generation (Gemini) + video generation (fal.ai)
  prompts.ts              — All prompt templates (photo/graphic/carousel/video_cover/story)
  verify.ts               — Gemini Vision verification
hooks/
  usePipeline.ts          — Client-side autopilot pipeline orchestration
```

## Known Issues / Recent Fixes
- Carousel slides sometimes not all generating — `parseSlides()` handles `[Slide N]` and `Slide N:` patterns
- Download order for carousels — added 1.5s delay between sequential downloads
- Session bleed — fixed with `resetAll()` on load + `cache: 'no-store'` everywhere
- Video text on screen — prompt explicitly forbids all text/titles/captions/watermarks
- Video "overlay" → "audio dialogue" replacement in prompt
