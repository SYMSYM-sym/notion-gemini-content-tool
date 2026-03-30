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
  previousFeedback?: VerificationResult | null
): Promise<{ images: string[]; prompts: string[] }> {
  const genAI = getGenAI();
  const prompts = buildSlidePrompts(entry, previousFeedback);
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
): Promise<{ videoUrl: string; prompt: string }> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error('FAL_KEY is not configured');

  // Dynamic import to avoid client-side bundling issues
  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: falKey });

  const ct = entry.contentType.toLowerCase();
  const aspectRatio = ct.includes('9:16') || ct.includes('reel') || ct.includes('video') ? '9:16' : '16:9';

  // Extract spoken dialogue from single quotes in the visual description
  const dialogueMatches = entry.visualDescription.match(/'([^']+)'/g);
  const spokenDialogue = dialogueMatches
    ? dialogueMatches.map((m) => m.replace(/'/g, '').trim()).filter(Boolean)
    : [];

  // Clean the visual description for video
  const visualDirection = entry.visualDescription
    .replace(/overlay/gi, 'audio dialogue')
    .replace(/\btext\s*:\s*["']?[^"'\n.]+["']?/gi, '')
    .replace(/\btitle\s*:\s*["']?[^"'\n.]+["']?/gi, '')
    .replace(/\bcaption\s*:\s*["']?[^"'\n.]+["']?/gi, '')
    .replace(/with\s+(?:the\s+)?text\b[^.;]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Calculate duration based on dialogue word count (~2.5 words/sec + 2s buffer)
  // fal.ai LTX v2.3 accepts: 6, 8, 10, 12, 14, 16, 18, 20
  const totalDialogueWords = spokenDialogue.reduce((sum, d) => sum + d.split(/\s+/).length, 0);
  const neededSeconds = totalDialogueWords > 0 ? Math.ceil(totalDialogueWords / 2.5) + 3 : 8;
  const allowedDurations = [6, 8, 10, 12, 14, 16, 18, 20];
  const duration = allowedDurations.find((d) => d >= neededSeconds) ?? 20;

  const dialogueInstruction = spokenDialogue.length > 0
    ? `\nSPOKEN DIALOGUE (a female voice must say ALL of these lines completely, do not cut off mid-sentence):
${spokenDialogue.map((d, i) => `${i + 1}. "${d}"`).join('\n')}
CRITICAL: Every line of dialogue above MUST be spoken in full. Pace the speech so all dialogue fits within the ${duration}-second video. Do NOT rush, skip, or truncate any words. Do NOT add any other narration or voiceover beyond these lines.`
    : '\nNo spoken dialogue — ambient sounds and music only.';

  const prompt = `Professional short video with ambient sound and music.

Topic: ${entry.topic}
Visual direction: ${visualDirection}
${dialogueInstruction}

Smooth, gentle camera movements. High production quality.
Include ambient music or gentle background sounds.
When depicting people, feature WOMEN — this content is for a female-focused audience.
Do NOT show any on-screen text, titles, captions, watermarks, logos, or words. Purely visual scenes only.`;

  let result;
  try {
    result = await fal.subscribe('fal-ai/ltx-2.3/text-to-video', {
      input: {
        prompt,
        duration,
        resolution: '1080p',
        aspect_ratio: aspectRatio,
        fps: 25,
        generate_audio: true,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Forbidden') || msg.includes('401') || msg.includes('403')) {
      throw new Error('FAL_KEY is invalid or expired — generate a new key at fal.ai/dashboard/keys and update it in Vercel env vars');
    }
    throw new Error(`fal.ai error: ${msg}`);
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
