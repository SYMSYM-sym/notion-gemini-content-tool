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

  // Clean the visual description for video
  const visualDirection = entry.visualDescription
    .replace(/overlay/gi, 'audio dialogue')
    .replace(/\btext\s*:\s*["']?[^"'\n.]+["']?/gi, '')
    .replace(/\btitle\s*:\s*["']?[^"'\n.]+["']?/gi, '')
    .replace(/\bcaption\s*:\s*["']?[^"'\n.]+["']?/gi, '')
    .replace(/["'][^"']{3,}["']/g, '')
    .replace(/with\s+(?:the\s+)?text\b[^.;]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const prompt = `Professional short video with ambient sound and music.

Topic: ${entry.topic}
Visual direction: ${visualDirection}

Smooth, gentle camera movements. High production quality.
Include ambient music or gentle background sounds.
Do NOT show any on-screen text, titles, captions, watermarks, logos, or words. Purely visual scenes only.`;

  let result;
  try {
    result = await fal.subscribe('fal-ai/ltx-2.3/text-to-video', {
      input: {
        prompt,
        duration: 8,
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
