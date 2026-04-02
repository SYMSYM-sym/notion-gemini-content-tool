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

  // Calculate duration based on dialogue word count (~2.5 words/sec + 2s buffer)
  // fal.ai LTX v2.3 accepts: 6, 8, 10, 12, 14, 16, 18, 20
  const totalDialogueWords = spokenDialogue.reduce((sum, d) => sum + d.split(/\s+/).length, 0);
  const neededSeconds = totalDialogueWords > 0 ? Math.ceil(totalDialogueWords / 2.5) + 3 : 8;
  const allowedDurations = [6, 8, 10, 12, 14, 16, 18, 20];
  const duration = allowedDurations.find((d) => d >= neededSeconds) ?? 20;

  // IMPORTANT: Do NOT include exact dialogue words in the prompt.
  // fal.ai LTX v2.3 renders any text it sees in the prompt as on-screen text.
  // Instead, describe the speech topic abstractly so the audio model generates
  // relevant narration without giving the video model words to render.
  const speechInstruction = spokenDialogue.length > 0
    ? `\nA woman speaks naturally about ${entry.topic.toLowerCase()}. Her voice is warm and conversational. She talks for the full ${duration} seconds.`
    : '\nAmbient sounds and gentle background music only. No speech.';

  const prompt = `Professional short video with no text visible anywhere. No titles, no captions, no subtitles, no watermarks, no labels, no words, no letters, no numbers on screen at any point.

Topic: ${entry.topic}
Visual direction: ${visualDirection}
${speechInstruction}

Smooth, gentle camera movements. High production quality.
When depicting people, feature WOMEN — this content is for a female-focused audience.`;

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
