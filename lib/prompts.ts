import { NotionEntry, VerificationResult } from './types';

export type ContentCategory = 'photo' | 'graphic' | 'carousel' | 'video_cover' | 'story';

/**
 * Strip text/overlay instructions from a visual description so image models
 * don't render on-screen text. Keeps the rest of the description intact.
 */
export function stripTextInstructions(description: string): string {
  return description
    // "Text: '...'" or "Text: "..."" or "Text: something"
    .replace(/\btext\s*:\s*["']?[^"'\n.;]+["']?/gi, '')
    // "Title: ..." / "Headline: ..." / "Caption: ..." / "Subtitle: ..."
    .replace(/\b(?:title|headline|caption|subtitle|tagline|heading|subheading)\s*:\s*["']?[^"'\n.;]+["']?/gi, '')
    // "with text '...'" / "with the text '...'"
    .replace(/with\s+(?:the\s+)?text\b[^.;]*/gi, '')
    // "text overlay ..."
    .replace(/text\s+overlay\b[^.;]*/gi, '')
    // "on-screen text ..."
    .replace(/on[- ]?screen\s+text\b[^.;]*/gi, '')
    // "overlay text ..."
    .replace(/overlay\s+text\b[^.;]*/gi, '')
    // "overlay: '...'" or "overlay '...'"
    .replace(/overlay\s*:?\s*["'][^"']+["']/gi, '')
    // "overlay" standalone → remove the word (replaced to nothing)
    .replace(/\boverlay\b/gi, '')
    // "showing the text ..." / "displaying text ..."
    .replace(/(?:showing|displaying|featuring|reading|saying)\s+(?:the\s+)?text\b[^.;]*/gi, '')
    // "words appear" / "words on screen"
    .replace(/\bwords?\s+(?:appear|on\s+screen|visible)\b[^.;]*/gi, '')
    // "'quoted text'" — remove single-quoted strings that look like overlay text
    .replace(/'[^']{3,}'/g, '')
    // Clean up double spaces and leading/trailing whitespace
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Determine the content category from the content type string.
 */
export function getContentCategory(contentType: string): ContentCategory {
  const ct = contentType.toLowerCase();
  if (ct.includes('carousel')) return 'carousel';
  if (ct.includes('reel') || ct.includes('video')) return 'video_cover';
  if (ct.includes('story') || ct.includes('stories')) return 'story';
  if (ct.includes('graphic') || ct.includes('infographic')) return 'graphic';
  return 'photo';
}

export function getAspectRatio(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('9:16')) return '9:16';
  if (ct.includes('1:1')) return '1:1';
  // 4:5 carousels, reels, images
  return '3:4';
}

/**
 * Parse a visual description into individual slides for carousels.
 */
export function parseSlides(visualDescription: string): string[] {
  // Try [Slide N] or [Slide N-M] patterns
  const parts = visualDescription.split(/\[Slide\s*\d+(?:\s*-\s*\d+)?\]\s*/i).filter((s) => s.trim());
  if (parts.length > 1) {
    const firstSlideIdx = visualDescription.search(/\[Slide\s*\d/i);
    const preamble = firstSlideIdx > 0 ? visualDescription.substring(0, firstSlideIdx).trim() : '';
    const filtered = preamble
      ? parts.filter((s) => s.trim() !== preamble.replace(/[:\s]+$/, '').trim())
      : parts;
    if (filtered.length > 1) return filtered.map((s) => s.trim());
    if (parts.length > 1) return parts.map((s) => s.trim());
  }

  // Try "Slide N:" patterns
  const parts2 = visualDescription.split(/Slide\s*\d+[:\s]+/i).filter((s) => s.trim());
  if (parts2.length > 1) return parts2.map((s) => s.trim());

  return [visualDescription.trim()];
}

/**
 * Build the right prompts based on content type analysis.
 * Returns an array of prompts — 1 for most types, N for carousels.
 */
export function buildSlidePrompts(
  entry: NotionEntry,
  previousFeedback?: VerificationResult | null
): string[] {
  const category = getContentCategory(entry.contentType);
  const aspectRatio = getAspectRatio(entry.contentType);

  switch (category) {
    case 'photo':
      return [buildPhotoPrompt(entry, aspectRatio, previousFeedback)];

    case 'graphic':
      return [buildGraphicPrompt(entry, aspectRatio, previousFeedback)];

    case 'carousel':
      return buildCarouselPrompts(entry, aspectRatio, previousFeedback);

    case 'video_cover':
      return [buildVideoCoverPrompt(entry, aspectRatio, previousFeedback)];

    case 'story':
      return [buildStoryPrompt(entry, previousFeedback)];

    default:
      return [buildPhotoPrompt(entry, aspectRatio, previousFeedback)];
  }
}

function buildPhotoPrompt(
  entry: NotionEntry,
  aspectRatio: string,
  previousFeedback?: VerificationResult | null
): string {
  const cleanVisual = stripTextInstructions(entry.visualDescription);

  let prompt = `ABSOLUTE RULE: NO TEXT ON THE IMAGE. Do not render any words, letters, numbers, titles, captions, labels, watermarks, handles, or any readable characters anywhere in the image.

Create a professional, high-quality Instagram photo.

Topic: ${entry.topic}
Visual direction: ${cleanVisual}

Requirements:
- This is a PHOTOGRAPH — create a realistic, high-resolution photo (not a graphic or illustration)
- Aspect ratio: ${aspectRatio}
- Follow the visual direction exactly as described above
- Instagram-ready quality
- When depicting people, feature WOMEN — this content is for a female-focused audience
- ZERO text of any kind on the image — no titles, captions, labels, handles, usernames, watermarks, or any visible words`;

  return appendFeedback(prompt, previousFeedback);
}

function buildGraphicPrompt(
  entry: NotionEntry,
  aspectRatio: string,
  previousFeedback?: VerificationResult | null
): string {
  const cleanVisual = stripTextInstructions(entry.visualDescription);

  let prompt = `ABSOLUTE RULE: NO TEXT ON THE IMAGE. Do not render any words, letters, numbers, titles, captions, labels, watermarks, handles, or any readable characters anywhere in the image.

Create a professional Instagram GRAPHIC/INFOGRAPHIC — communicate entirely through visuals, icons, illustrations, and color.

Topic: ${entry.topic}
Visual direction: ${cleanVisual}

Requirements:
- This is a DESIGNED GRAPHIC — create a polished, branded design (not a photograph)
- Use icons, illustrations, visual metaphors, and color to communicate — NOT text
- Aspect ratio: ${aspectRatio}
- Layout: Well-organized with clear visual hierarchy
- When depicting people or illustrations, feature WOMEN — this content is for a female-focused audience
- Instagram-ready, no watermarks
- ZERO text of any kind on the image — no titles, captions, labels, handles, usernames, watermarks, or any visible words`;

  return appendFeedback(prompt, previousFeedback);
}

function buildCarouselPrompts(
  entry: NotionEntry,
  aspectRatio: string,
  previousFeedback?: VerificationResult | null
): string[] {
  const slides = parseSlides(entry.visualDescription);

  return slides.map((slideDesc, i) => {
    const isFirst = i === 0;
    const slideLabel = `Slide ${i + 1} of ${slides.length}`;
    const cleanSlide = stripTextInstructions(slideDesc);

    let prompt = `ABSOLUTE RULE: NO TEXT ON THE IMAGE. Do not render any words, letters, numbers, titles, captions, labels, watermarks, handles, or any readable characters anywhere in the image.

Create a professional Instagram carousel ${slideLabel}.

Topic: ${entry.topic}
This slide's visual content: ${cleanSlide}
${isFirst ? 'This is the COVER SLIDE — it should be eye-catching and draw people to swipe.' : 'This is an inner slide — communicate the information through visuals, icons, and imagery only.'}

Requirements:
- Aspect ratio: ${aspectRatio} (4:5 portrait format)
- Maintain consistent styling across all slides in this carousel
- Communicate information through visuals, icons, and imagery — NOT text
- When depicting people, feature WOMEN — this content is for a female-focused audience
- Instagram-ready, no watermarks
- ZERO text of any kind on the image — no titles, captions, labels, handles, usernames, watermarks, or any visible words`;

    return appendFeedback(prompt, previousFeedback);
  });
}

function buildVideoCoverPrompt(
  entry: NotionEntry,
  aspectRatio: string,
  previousFeedback?: VerificationResult | null
): string {
  const isReel = entry.contentType.toLowerCase().includes('reel');
  const format = isReel ? 'Reel' : 'Video';
  const cleanVisual = stripTextInstructions(entry.visualDescription);

  let prompt = `ABSOLUTE RULE: NO TEXT ON THE IMAGE. Do not render any words, letters, numbers, titles, captions, labels, watermarks, handles, or any readable characters anywhere in the image.

Create a professional Instagram ${format} COVER THUMBNAIL.

Topic: ${entry.topic}
Video description: ${cleanVisual}

Requirements:
- This is a COVER THUMBNAIL for a ${format} — create a single eye-catching static image that represents the video content
- The thumbnail should make viewers want to watch the ${format.toLowerCase()}
- Aspect ratio: ${aspectRatio}
- Show the key visual element from the video description as a still frame
- Add a subtle cinematic feel to indicate this is for video
- When depicting people, feature WOMEN — this content is for a female-focused audience
- Instagram-ready, no watermarks
- ZERO text of any kind on the image — no titles, captions, labels, handles, usernames, watermarks, or any visible words`;

  return appendFeedback(prompt, previousFeedback);
}

function buildStoryPrompt(
  entry: NotionEntry,
  previousFeedback?: VerificationResult | null
): string {
  const cleanVisual = stripTextInstructions(entry.visualDescription);

  let prompt = `ABSOLUTE RULE: NO TEXT ON THE IMAGE. Do not render any words, letters, numbers, titles, captions, labels, watermarks, handles, or any readable characters anywhere in the image.

Create a professional Instagram Story image.

Topic: ${entry.topic}
Visual direction: ${cleanVisual}

Requirements:
- This is an Instagram STORY — vertical format, 9:16 aspect ratio
- Bold, attention-grabbing visuals
- When depicting people, feature WOMEN — this content is for a female-focused audience
- Instagram-ready, no watermarks
- ZERO text of any kind on the image — no titles, captions, labels, handles, usernames, watermarks, or any visible words`;

  return appendFeedback(prompt, previousFeedback);
}

function appendFeedback(
  prompt: string,
  previousFeedback?: VerificationResult | null
): string {
  if (previousFeedback) {
    prompt += `

IMPORTANT CORRECTIONS (previous attempt scored ${previousFeedback.score}/10):
- Feedback: ${previousFeedback.feedback}
- Missing elements: ${previousFeedback.missingElements.join(', ')}
- Unwanted elements: ${previousFeedback.unwantedElements.join(', ')}
- Please fix these issues in this attempt.`;
  }
  return prompt;
}

// Backward compat
export function buildGenerationPrompt(
  entry: NotionEntry,
  previousFeedback?: VerificationResult | null
): string {
  return buildSlidePrompts(entry, previousFeedback)[0];
}

export function buildVerificationPrompt(entry: NotionEntry): string {
  const category = getContentCategory(entry.contentType);

  const categoryContext: Record<ContentCategory, string> = {
    photo: 'This should be a realistic PHOTOGRAPH (not a graphic/illustration).',
    graphic: 'This should be a designed GRAPHIC/INFOGRAPHIC that communicates through visuals, icons, and illustrations.',
    carousel: 'This is a slide from a CAROUSEL — check if it has proper slide-style layout.',
    video_cover: 'This is a COVER THUMBNAIL for a video/reel — it should look like a video thumbnail with cinematic feel. Do NOT penalize it for being a static image.',
    story: 'This is an Instagram STORY image — vertical format, bold visuals.',
  };

  return `You are a visual quality checker for Instagram content. You will receive:
1. An AI-generated image
2. The original visual description/instructions that were used to create it

Content type: ${entry.contentType}
${categoryContext[category]}

CRITICAL RULE: The image must contain NO visible text of any kind. Any text, titles, captions, labels, watermarks, handles, or readable characters in the image is a MAJOR defect. If you see ANY text on the image, deduct at least 3 points and list it in unwanted_elements.

Score the image 1-10 on how well it matches the instructions. Consider:
- Does it contain the correct objects, scenes, and elements described?
- Does it match the described style/mood from the visual direction?
- Is it high quality and Instagram-ready?
- Does it avoid unwanted elements (watermarks, distortion, wrong aspect ratio, social media handles)?
- Does it contain ZERO visible text? (Any text = automatic score penalty)
${category === 'video_cover' ? '- For video thumbnails: DO NOT penalize for being a static image. Score based on whether it makes a good thumbnail for the described video content.' : ''}

Respond with JSON only:
{
  "score": <1-10>,
  "matches": <true if score >= 7>,
  "feedback": "<specific feedback on what matches and what doesn't>",
  "missing_elements": ["<list of things from description not present in image>"],
  "unwanted_elements": ["<list of things in image not asked for — ALWAYS include 'text overlay' here if any visible text exists>"]
}`;
}

// Keep old constant for backward compat
export const VERIFICATION_PROMPT = `You are a visual quality checker for Instagram content. You will receive:
1. An AI-generated image
2. The original visual description/instructions that were used to create it

Score the image 1-10 on how well it matches the instructions. Consider:
- Does it contain the correct objects, scenes, and elements described?
- Does it match the described style/mood from the visual direction?
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
