import { GoogleGenerativeAI } from '@google/generative-ai';
import { NotionEntry, VerificationResult } from './types';
import { buildSlidePrompts, getAspectRatio, stripTextForVideo } from './prompts';

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

  // Extract spoken dialogue from ANY type of quotes in the visual description:
  // single quotes: '...'  double quotes: "..."
  // smart quotes: \u2018...\u2019  \u201C...\u201D
  // Also match Narration/Voiceover/Speaker prefixed lines
  const quotePattern = /(?:[""\u201C])([^""\u201D]{5,})(?:[""\u201D])|(?:['\u2018])([^'\u2019]{5,})(?:['\u2019])/g;
  const narratorPattern = /(?:narrat(?:ion|or)|voiceover|voice[- ]?over|speaker|says?|speak(?:ing|s)?)\s*:\s*["'\u201C\u2018]?([^"'\u201D\u2019\n.]{5,})["'\u201D\u2019]?/gi;

  const dialogueSet = new Set<string>();
  let match;
  while ((match = quotePattern.exec(entry.visualDescription)) !== null) {
    const text = (match[1] || match[2]).trim();
    if (text) dialogueSet.add(text);
  }
  while ((match = narratorPattern.exec(entry.visualDescription)) !== null) {
    const text = match[1].trim();
    if (text) dialogueSet.add(text);
  }
  const spokenDialogue = Array.from(dialogueSet);

  // Aggressively strip the visual description for video — remove all quoted content
  // (dialogue already extracted above), text/overlay instructions, and anything
  // that could cause fal.ai to render on-screen text
  const visualDirection = stripTextForVideo(entry.visualDescription);

  // fal.ai LTX v2.3 only accepts duration: 6, 8, or 10 seconds.
  // When dialogue exists, always use max duration (10s) so speech isn't cut off.
  const duration = spokenDialogue.length > 0 ? 10 : 8;

  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL: fal.ai LTX v2.3 renders ANY text-like content as on-screen text.
  //
  // TEXT APPEARS IN TWO FORMS:
  //   1. Subtitle overlays — triggered by narration/voice/speech mentions
  //   2. Text on props (cards, signs, screens) — triggered by topic words like
  //      "timeline", "recap", "tips" and by "Feature women" + educational context
  //      which makes the model show a woman presenting/holding cards
  //
  // RULES:
  //   - Do NOT put the topic/theme in the prompt — words like "timeline", "recap",
  //     "individuality" make the model generate title cards or presentation scenes
  //   - Do NOT mention narration, voice, speech, or dialogue
  //   - Do NOT include negative text instructions ("no text") — makes it worse
  //   - Do NOT say "Feature women" — combine with any topic and fal.ai generates
  //     a woman holding/presenting cards with text
  //   - Keep the prompt as a PURE visual/atmospheric shot description
  //   - Cap length — long prompts give fal.ai more material to render as text
  // ═══════════════════════════════════════════════════════════════════════════

  // Cap visual direction — short prompt = less text-trigger surface area
  const maxVisualLen = 180;
  const trimmedVisual = visualDirection.length > maxVisualLen
    ? visualDirection.slice(0, visualDirection.lastIndexOf(' ', maxVisualLen)).replace(/[,.]$/, '')
    : visualDirection;

  // Build a purely atmospheric/cinematic prompt — no topic, no people-doing-things
  const rawPrompt = trimmedVisual
    ? `Cinematic b-roll. ${trimmedVisual}. Slow smooth camera drift, soft golden-hour lighting, shallow depth of field, warm color grading.`
    : 'Cinematic b-roll. Gentle atmospheric lifestyle footage. Slow smooth camera drift, soft golden-hour lighting, shallow depth of field, warm color grading.';

  // Final safety-net: scrub the assembled prompt one more time
  const prompt = rawPrompt
    .replace(/["'\u201C\u2018][^"'\u201C\u201D\u2018\u2019]{2,}["'\u201D\u2019]/g, '')
    .replace(/[^.;\n]{1,50}:\s*[^.;\n]*/g, '')
    .replace(/\b(?:narrat\w*|voiceover|voice[- ]?over|speech|speaks?|says?|dialogue|subtitle|caption|letter(?:ing)?|text|reading|reads|holding|presenting|showing|displaying)\b[^.;]*/gi, '')
    .replace(/[^.;]*\b(?:card|sign|paper|book|screen|poster|board|note|phone|tablet|laptop|whiteboard)\b[^.;]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s*\.+/g, '.')
    .trim();

  // Debug: log the exact prompt and what was stripped so we can trace text triggers
  console.log('[VIDEO PROMPT DEBUG]', JSON.stringify({
    originalVisualDesc: entry.visualDescription.slice(0, 500),
    strippedVisualDir: visualDirection.slice(0, 500),
    trimmedVisual,
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
