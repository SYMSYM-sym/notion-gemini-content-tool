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
 * Generate a video. Tries Veo 3.0 Fast (has audio), falls back to Veo 2 (no audio).
 * Long-running operation that polls until complete.
 */
export async function generateVideo(
  entry: NotionEntry,
): Promise<{ videoUrl: string; prompt: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const aspectRatio = getAspectRatio(entry.contentType);
  // Replace "overlay" with "audio dialogue" for video entries
  const visualDirection = entry.visualDescription.replace(/overlay/gi, 'audio dialogue');
  const prompt = `Create a professional, high-quality short video with ambient sound.

Topic: ${entry.topic}
Visual direction: ${visualDirection}

Audio: Include appropriate ambient music or gentle background sounds for the scene. Any spoken dialogue should be brief and fit within 8 seconds.
Style: Follow the visual direction above. Smooth, gentle movements. High production quality.
IMPORTANT: Do NOT add any on-screen text, titles, captions, watermarks, handles, or text overlays to the video. The video should be purely visual (with audio) and no text of any kind.`;

  // Try models in order: Veo 3 Fast (audio), Veo 2 (no audio but more quota)
  const models = [
    { name: 'veo-3.0-fast-generate-001', duration: 8, label: 'Veo 3 Fast' },
    { name: 'veo-2.0-generate-001', duration: 8, label: 'Veo 2' },
  ];

  for (const model of models) {
    try {
      const startRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:predictLongRunning?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
              aspectRatio,
              durationSeconds: model.duration,
            },
          }),
        }
      );

      if (!startRes.ok) {
        const err = await startRes.json();
        const msg = err.error?.message || '';
        console.error(`${model.label} failed:`, msg);
        // If rate limited or quota exceeded, try next model
        if (msg.includes('quota') || msg.includes('rate') || msg.includes('429') || msg.includes('Too')) {
          continue;
        }
        // For other errors (bad request), adjust and retry
        if (msg.includes('durationSeconds') && model.duration === 8) {
          // Retry with shorter duration
          const retryRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:predictLongRunning?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instances: [{ prompt }],
                parameters: { aspectRatio, durationSeconds: 5 },
              }),
            }
          );
          if (!retryRes.ok) continue;
          const retryData = await retryRes.json();
          if (!retryData.name) continue;
          const result = await pollVideoOperation(retryData.name, apiKey);
          if (result) return { videoUrl: result, prompt };
          continue;
        }
        continue;
      }

      const startData = await startRes.json();
      if (!startData.name) continue;

      console.log(`Video generation started with ${model.label}`);
      const result = await pollVideoOperation(startData.name, apiKey);
      if (result) return { videoUrl: result, prompt };
    } catch (e) {
      console.error(`${model.label} error:`, e);
      continue;
    }
  }

  throw new Error('Video generation failed — all models exhausted (may be rate limited, try again in a few minutes)');
}

async function pollVideoOperation(operationName: string, apiKey: string): Promise<string | null> {
  // Poll for up to 3 minutes
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const pollRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`
    );
    const pollData = await pollRes.json();

    if (pollData.done) {
      const samples = pollData.response?.generateVideoResponse?.generatedSamples;
      if (samples && samples.length > 0 && samples[0].video?.uri) {
        return samples[0].video.uri + '&key=' + apiKey;
      }
      return null;
    }
  }
  return null;
}

// Backward compat
export async function generateImage(
  entry: NotionEntry,
  previousFeedback?: VerificationResult | null
): Promise<{ imageBase64: string; prompt: string }> {
  const { images, prompts } = await generateImages(entry, previousFeedback);
  return { imageBase64: images[0], prompt: prompts[0] };
}
