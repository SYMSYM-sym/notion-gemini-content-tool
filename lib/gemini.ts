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
 * Generate a video using Veo 3.0 Fast (includes audio).
 * This is a long-running operation that polls until complete.
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

  // Start the long-running operation with Veo 3.0 Fast (includes audio)
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          aspectRatio,
          durationSeconds: 8,
        },
      }),
    }
  );

  if (!startRes.ok) {
    const err = await startRes.json();
    throw new Error(err.error?.message || 'Failed to start video generation');
  }

  const startData = await startRes.json();
  const operationName = startData.name;
  if (!operationName) throw new Error('No operation name returned');

  // Poll for completion (up to 3 minutes — Veo 3 takes longer)
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const pollRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`
    );
    const pollData = await pollRes.json();

    if (pollData.done) {
      const samples = pollData.response?.generateVideoResponse?.generatedSamples;
      if (samples && samples.length > 0 && samples[0].video?.uri) {
        const videoUri = samples[0].video.uri + '&key=' + apiKey;
        return { videoUrl: videoUri, prompt };
      }
      throw new Error('Video generation completed but no video was returned');
    }
  }

  throw new Error('Video generation timed out after 3 minutes');
}

// Backward compat
export async function generateImage(
  entry: NotionEntry,
  previousFeedback?: VerificationResult | null
): Promise<{ imageBase64: string; prompt: string }> {
  const { images, prompts } = await generateImages(entry, previousFeedback);
  return { imageBase64: images[0], prompt: prompts[0] };
}
