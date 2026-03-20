import { NotionEntry, VerificationResult } from './types';

export function getAspectRatio(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('carousel') || ct.includes('4:5')) return '3:4';
  if (ct.includes('9:16') || ct.includes('video') || ct.includes('reel')) return '9:16';
  return '1:1';
}

export function buildGenerationPrompt(
  entry: NotionEntry,
  previousFeedback?: VerificationResult | null
): string {
  let prompt = `Create a professional Instagram ${entry.contentType} image for a women's health and wellness account (@herhealthinfo).
Topic: ${entry.topic}.
Visual direction: ${entry.visualDescription}
Style: Clean, modern, feminine wellness aesthetic. Brand colors: soft sage green and blush pink.
The image should feel calming, empowering, and professional.
High quality, Instagram-ready, no watermarks, no text unless specified in the visual direction.`;

  if (previousFeedback) {
    prompt += `

IMPORTANT CORRECTIONS (previous attempt scored ${previousFeedback.score}/10):
- Feedback: ${previousFeedback.feedback}
- Missing elements: ${previousFeedback.missingElements.join(', ')}
- Please make sure to include these elements and fix the noted issues.`;
  }

  return prompt;
}

export const VERIFICATION_PROMPT = `You are a visual quality checker for Instagram content. You will receive:
1. An AI-generated image
2. The original visual description/instructions that were used to create it

Score the image 1-10 on how well it matches the instructions. Consider:
- Does it contain the correct objects, scenes, and elements described?
- Does it match the described style/mood (feminine wellness, sage green/blush pink brand)?
- Is it high quality and Instagram-ready?
- Does it avoid unwanted elements (watermarks, distortion, wrong aspect ratio)?

Respond with JSON only:
{
  "score": <1-10>,
  "matches": <true if score >= 7>,
  "feedback": "<specific feedback on what matches and what doesn't>",
  "missing_elements": ["<list of things from description not present in image>"],
  "unwanted_elements": ["<list of things in image not asked for>"]
}`;
