# Notion Content Generator

Generate Instagram content images from a Notion content calendar using Google Gemini. Features an autopilot pipeline that generates, verifies, and auto-approves images one at a time.

## Features

- Reads public Notion databases (no API key needed)
- Generates images with Google Gemini (Imagen 3 / Gemini Flash)
- AI-powered visual verification scores each image 1-10
- Auto-approves passing images (score >= 7), auto-retries failures up to 3 times
- Flags persistent failures for manual review
- Real-time dashboard with live status updates
- Bulk download approved images as zip

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/notion-gemini-content-tool.git
cd notion-gemini-content-tool
npm install
```

### 2. Environment Variables

Copy the example env file and fill in your keys:

```bash
cp .env.local.example .env.local
```

- **GEMINI_API_KEY**: Get from [Google AI Studio](https://aistudio.google.com/apikey)
- **BLOB_READ_WRITE_TOKEN**: From Vercel dashboard (Project Settings > Storage > Create Blob Store)
- **DEFAULT_NOTION_URL**: Your public Notion database URL
- **NEXT_PUBLIC_DEFAULT_NOTION_URL**: Same URL (for client-side default)

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Link to your project
vercel link

# Set environment variables
vercel env add GEMINI_API_KEY
vercel env add BLOB_READ_WRITE_TOKEN
vercel env add DEFAULT_NOTION_URL
vercel env add NEXT_PUBLIC_DEFAULT_NOTION_URL

# Deploy
vercel --prod
```

Or connect via the [Vercel Dashboard](https://vercel.com/new) by importing your GitHub repo.

### Creating a Vercel Blob Store

1. Go to your Vercel project dashboard
2. Navigate to **Storage** tab
3. Click **Create Database** > **Blob**
4. The `BLOB_READ_WRITE_TOKEN` will be automatically added to your project

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Google Gemini API (image generation + vision verification)
- Vercel Blob (image storage)
- notion-client (public page scraping)
