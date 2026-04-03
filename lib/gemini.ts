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
    `You are rewriting a video description for an AI video generator (fal.ai) that CANNOT render readable text. Your job is to create a visually compelling prompt that captures the SUBJECT MATTER and EMOTIONAL TONE of the original — not necessarily the exact staging.

IMPORTANT: Many descriptions describe someone "presenting information" or "showing text/cards/labels." Since the video generator cannot show readable text, you must REIMAGINE these as real-world visual scenes about the same subject. For example:
- "A creator holds up age category cards (Puppy, Adult, Senior)" → "Close-up montage of a playful puppy, a calm adult dog, and a gentle senior dog resting, each in warm home settings"
- "Text flashes showing dental exam tips" → "A veterinarian gently examining a dog's teeth in a bright clinic"
- "A woman presents her skincare routine steps" → "Close-up of hands applying serum to glowing skin, soft bathroom lighting, steam rising"

RULES:
1. Identify the SUBJECT (what is the content actually about — pets? skincare? wellness?)
2. Create a vivid, cinematic scene showing that subject in action — real moments, not presentations
3. Include specific visual details: lighting, colors, camera angles, textures, setting
4. Feature women when the scene includes people — this is for a female-focused audience
5. NEVER include: readable text, labels, captions, subtitles, titles, narration instructions, dialogue, quotation marks, numbered lists, hashtags, colon-separated labels
6. NEVER describe someone presenting, holding up items to camera, pointing at things, or demonstrating
7. Keep it 2-3 sentences, under 120 words
8. Output ONLY the rewritten prompt, nothing else

Theme: ${themeHint}

Original description:
${entry.visualDescription.slice(0, 800)}`
  );

  const rewritten = rewriteResult.response.text()?.trim() || '';

  // Use max duration (10s) to ensure speech/audio has room to complete full thoughts
  const duration = 10;

  // Keep the prompt concise — long prompts give fal.ai more surface area to render text
  const prompt = rewritten
    ? rewritten.slice(0, 400)
    : `Cinematic lifestyle footage related to ${themeHint.toLowerCase()}. Soft natural lighting, warm tones, shallow depth of field, gentle camera movement.`;

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
