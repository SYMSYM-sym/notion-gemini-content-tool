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

  // Fallback: Gemini 2.0 Flash
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
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
  // fal.ai LTX v2.3 renders ANY text-like content as on-screen text. This
  // includes subtitles, title cards, and text on physical props (cards, signs,
  // screens, papers). The visual descriptions from Notion are written for full
  // production videos with presenters, demonstrations, and product labels —
  // they are fundamentally incompatible with fal.ai's text-rendering behavior.
  //
  // Regex-based stripping CANNOT solve this because:
  //   - Natural language has infinite ways to describe "person shows text"
  //   - Heavy stripping mangles the prompt → fal.ai generates random scenes
  //   - Random scenes from fal.ai often include text anyway
  //
  // Solution: Use Gemini to rewrite the description into PURE cinematic
  // atmosphere — colors, lighting, textures, mood, camera angles. Gemini
  // understands context and can reliably eliminate ALL text triggers while
  // preserving the emotional essence of the scene.
  // ═══════════════════════════════════════════════════════════════════════════

  const genAI = getGenAI();
  const rewriteModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const themeHint = theme || entry.topic;
  const rewriteResult = await rewriteModel.generateContent(
    `Rewrite the following video description into a 2-sentence cinematic b-roll prompt for an AI video generator.

STRICT RULES — the output MUST follow ALL of these:
- Describe ONLY: colors, lighting, textures, fabrics, nature, atmospheric mood, camera movement, depth of field
- NEVER mention: people doing actions, hands, holding anything, objects with writing, screens, cards, papers, books, signs, labels, products, bottles, packages, brands, text, words, letters, titles, captions, subtitles, narration, voiceover, speech, dialogue
- NEVER use words that could appear as on-screen text (product names, category names, labels)
- NO people performing actions like presenting, demonstrating, pointing, flipping, opening, showing
- Focus on close-up textures, soft backgrounds, gentle motion, atmospheric details
- Keep it under 120 words
- Output ONLY the rewritten prompt, nothing else

Theme: ${themeHint}

Original description:
${entry.visualDescription.slice(0, 600)}`
  );

  const rewritten = rewriteResult.response.text()?.trim() || '';

  // Use max duration (10s) to ensure speech/audio has room to complete full thoughts
  const duration = 10;

  const prompt = rewritten
    ? `Cinematic b-roll. ${rewritten.slice(0, 250)}. Slow smooth camera drift, shallow depth of field, warm color grading.`
    : 'Cinematic b-roll. Soft warm light filtering through sheer curtains onto natural textures and fabrics. Gentle bokeh highlights drift across the frame. Slow smooth camera drift, shallow depth of field, warm color grading.';

  // Debug: log so we can verify Gemini rewrites are clean
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
