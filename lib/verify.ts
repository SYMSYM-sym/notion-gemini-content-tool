import { GoogleGenerativeAI } from '@google/generative-ai';
import { NotionEntry, VerificationResult } from './types';
import { buildVerificationPrompt, stripTextInstructions } from './prompts';

export async function verifyImage(
  imageBase64: string,
  entry: NotionEntry
): Promise<VerificationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const verificationPrompt = buildVerificationPrompt(entry);
  const cleanVisual = stripTextInstructions(entry.visualDescription);

  const userPrompt = `Original visual description/instructions:
"${cleanVisual}"

Topic: ${entry.topic}
Content type: ${entry.contentType}

IMPORTANT: The image must contain NO visible text whatsoever. If you see any text, titles, captions, labels, or words on the image, that is a major defect — list it in unwanted_elements and deduct points.

Please evaluate the attached image against these instructions.`;

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'image/png',
        data: imageBase64,
      },
    },
    `${verificationPrompt}\n\n${userPrompt}`,
  ]);

  const text = result.response.text();

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Verification response did not contain valid JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    score: Number(parsed.score) || 0,
    matches: parsed.matches ?? parsed.score >= 7,
    feedback: parsed.feedback || '',
    missingElements: parsed.missing_elements || [],
    unwantedElements: parsed.unwanted_elements || [],
  };
}
