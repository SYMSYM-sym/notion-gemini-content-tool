import { GoogleGenerativeAI } from '@google/generative-ai';
import { NotionEntry, VerificationResult } from './types';
import { buildSlidePrompts, getAspectRatio } from './prompts';

function getGenAI(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  return new GoogleGenerativeAI(apiKey);
}

async function generateSingleImage(
  genAI: GoogleGenerativeAI,
  prompt: string,
  aspectRatio: string
): Promise<string> {
  // Primary: Gemini 2.5 Flash with image generation
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-image',
      generationConfig: {
        // @ts-expect-error - responseModalities is valid for image generation
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const result = await model.generateContent(
      `${prompt}\n\nAspect ratio: ${aspectRatio}. Generate an image.`
    );

    const parts = result.response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        return part.inlineData.data;
      }
    }
  } catch (e) {
    console.error('Gemini 2.5 Flash image gen failed:', e);
  }

  // Fallback: Gemini 2.5 Flash
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        // @ts-expect-error - responseModalities is valid for image generation
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const result = await model.generateContent(
      `${prompt}\n\nAspect ratio: ${aspectRatio}. Generate an image.`
    );

    const parts = result.response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        return part.inlineData.data;
      }
    }
  } catch (e) {
    console.error('Gemini 2.0 Flash fallback failed:', e);
  }

  throw new Error('Failed to generate image. No image was returned by the model.');
}

export async function generateImages(
  entry: NotionEntry,
  previousFeedback?: VerificationResult | null,
  theme?: string
): Promise<{ images: string[]; prompts: string[] }> {
  const genAI = getGenAI();
  const prompts = buildSlidePrompts(entry, previousFeedback, theme);
  const aspectRatio = getAspectRatio(entry.contentType);

  const images: string[] = [];
  for (let i = 0; i < prompts.length; i++) {
    console.log(`Generating slide ${i + 1}/${prompts.length}...`);
    const imageBase64 = await generateSingleImage(genAI, prompts[i], aspectRatio);
    images.push(imageBase64);

    // Small delay between slides to avoid rate limits
    if (i < prompts.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return { images, prompts };
}

/**
 * Generate a video using fal.ai LTX v2.3 (includes audio).
 * Uses the @fal-ai/client SDK for queue management.
 */
export async function generateVideo(
  entry: NotionEntry,
  theme?: string,
): Promise<{ videoUrl: string; prompt: string }> {
  const falKey = process.env.FAL_KEY?.trim();
  if (!falKey) throw new Error('FAL_KEY is not configured');

  // Dynamic import to avoid client-side bundling issues
  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: falKey });

  const ct = entry.contentType.toLowerCase();
  const aspectRatio = ct.includes('9:16') || ct.includes('reel') || ct.includes('video') ? '9:16' : '16:9';

  // ═══════════════════════════════════════════════════════════════════════════
  // WHY WE USE GEMINI TO REWRITE THE PROMPT:
  //
  // fal.ai LTX v2.3 renders ANY text-like content as on-screen text — including
  // subtitles, title cards, and text on physical props (cards, signs, screens).
  // Regex-based stripping cannot solve this: natural language has infinite ways
  // to describe text-bearing scenes, and heavy stripping mangles prompts.
  //
  // Solution: Gemini rewrites the visual description to stay FAITHFUL to the
  // original scene (same people, actions, setting, objects, mood) while only
  // neutralizing text triggers — removing specific words/labels/names that would
  // appear ON objects, and replacing text-bearing props with their visual form.
  // ═══════════════════════════════════════════════════════════════════════════

  const genAI = getGenAI();
  const rewriteModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const themeHint = theme || entry.topic;
  const rewriteResult = await rewriteModel.generateContent(
    `You are rewriting a video description for an AI video generator (fal.ai) that cannot render readable text. Keep the scene as close to the original as possible. Same people, same actions, same setting, same objects, same mood.

YOUR ONLY JOB is to remove elements that would cause READABLE TEXT to appear on screen:
- Remove voiceover scripts, narration text, dialogue in quotes
- Remove specific product names, brand names, category labels (e.g. "Omega-3 liquid" → "a bottle of liquid supplement", "Puppy, Adult, Senior" → "different supplement bottles")
- Remove instructions about text overlays, disclaimers, captions, subtitles, hashtags
- Remove numbered lists and colon-separated labels

KEEP EVERYTHING ELSE exactly as described:
- Keep the person and what they are doing (opening a cabinet, applying skincare, pouring a drink)
- Keep the setting (kitchen, bathroom, clinic, studio)
- Keep specific objects (bottles, jars, containers, tools) — just don't specify what's written on them
- Keep the mood, lighting, camera style
- Keep the sequence of actions

EXAMPLES of correct rewrites:
- "A creator holds open their pet supplement cabinet. They reveal Omega-3 liquid, probiotics, and joint support chews." → "A woman opens a cabinet filled with supplement bottles and containers. She picks up several colorful bottles, examining each one with a smile. Warm kitchen lighting, close-up details."
- "Text flashes: Annual blood work, Dental exams, Senior care timeline" → "A montage of a veterinarian caring for dogs — checking vitals, examining teeth, gentle handling of an older dog in a bright clinic."
- "A woman presents her 5-step skincare routine" → "A woman goes through her skincare routine — applying serums, creams, and oils at her bathroom vanity. Soft warm lighting, mirror reflections, close-up of products and skin."

Only reimagine the scene when the ENTIRE description is nothing but text/graphics with no physical scene at all.

Feature women when the scene includes people.
Weave the creative theme naturally into the scene's mood, color palette, and visual style — the video should clearly feel like it belongs to this theme.
Keep it 2-3 sentences. Output ONLY the rewritten prompt.

Creative theme: ${themeHint}

Original description:
${entry.visualDescription.slice(0, 800)}`
  );

  const rewritten = rewriteResult.response.text()?.trim() || '';

  // Use max duration (10s) to ensure speech/audio has room to complete full thoughts
  const duration = 10;

  // Include the theme in the final prompt so fal.ai generates visuals aligned with it.
  // Use natural phrasing to avoid colon patterns that trigger text rendering.
  const themeLower = themeHint.toLowerCase();
  const prompt = rewritten
    ? `${themeLower} themed cinematic footage. ${rewritten.slice(0, 380)}`
    : `Cinematic lifestyle footage evoking ${themeLower}. Soft natural lighting, warm tones, shallow depth of field, gentle camera movement.`;

  // Debug: log so we can verify Gemini rewrites stay faithful but text-free
  console.log('[VIDEO PROMPT DEBUG]', JSON.stringify({
    originalVisualDesc: entry.visualDescription.slice(0, 500),
    geminiRewrite: rewritten.slice(0, 500),
    fullPrompt: prompt,
  }, null, 2));

  let result;
  try {
    result = await fal.subscribe('fal-ai/ltx-2.3/text-to-video', {
      input: {
        prompt,
        duration,
        resolution: '1080p',
        aspect_ratio: aspectRatio,
        fps: 24,
        generate_audio: true,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Include full error detail for debugging
    const detail = (err as { body?: unknown })?.body
      ? JSON.stringify((err as { body: unknown }).body).slice(0, 300)
      : '';
    if (msg.includes('Forbidden') || msg.includes('401') || msg.includes('403')) {
      throw new Error('FAL_KEY is invalid or expired — generate a new key at fal.ai/dashboard/keys and update it in Vercel env vars');
    }
    throw new Error(`fal.ai error: ${msg}${detail ? ' — ' + detail : ''}`);
  }

  const videoUrl = (result.data as { video?: { url?: string } })?.video?.url;
  if (!videoUrl) {
    throw new Error('Video generation completed but no video URL returned');
  }

  return { videoUrl, prompt };
}

// Backward compat
export async function generateImage(
  entry: NotionEntry,
  previousFeedback?: VerificationResult | null
): Promise<{ imageBase64: string; prompt: string }> {
  const { images, prompts } = await generateImages(entry, previousFeedback);
  return { imageBase64: images[0], prompt: prompts[0] };
}
