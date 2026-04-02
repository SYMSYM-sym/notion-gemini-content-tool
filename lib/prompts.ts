import { NotionEntry, VerificationResult } from './types';

export type ContentCategory = 'photo' | 'graphic' | 'carousel' | 'video_cover' | 'story';

/** All quote characters (straight + smart/curly) */
const Q = `["'\u201C\u201D\u2018\u2019]`;
const Q_OPEN = `["'\u201C\u2018]`;
const Q_CLOSE = `["'\u201D\u2019]`;
const Q_INNER = `[^"'\u201C\u201D\u2018\u2019]`;

/**
 * Strip text/overlay instructions from a visual description for IMAGES.
 * Light-touch: only removes phrases that explicitly ask for rendered text.
 * Preserves style directions and artistic instructions.
 */
export function stripTextInstructions(description: string): string {
  return description
    // "Text: '...'" or "Text: "..."" — explicit text overlay instructions
    .replace(new RegExp(`\\btext\\s*:\\s*${Q_OPEN}${Q_INNER}+${Q_CLOSE}`, 'gi'), '')
    // "Title: '...'" etc. — explicit label overlays with quoted content
    .replace(new RegExp(`\\b(?:title|headline|caption|subtitle|tagline)\\s*:\\s*${Q_OPEN}${Q_INNER}+${Q_CLOSE}`, 'gi'), '')
    // "with text '...'" / "with the text '...'"
    .replace(new RegExp(`with\\s+(?:the\\s+)?text\\s+${Q_OPEN}${Q_INNER}+${Q_CLOSE}`, 'gi'), '')
    // "text overlay" phrases
    .replace(/text\s+overlay\b[^.;]*/gi, '')
    // "on-screen text ..."
    .replace(/on[- ]?screen\s+text\b[^.;]*/gi, '')
    // "overlay text ..."
    .replace(/overlay\s+text\b[^.;]*/gi, '')
    // "overlay: '...'" — explicit overlay with quoted content
    .replace(new RegExp(`overlay\\s*:\\s*${Q_OPEN}${Q_INNER}+${Q_CLOSE}`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Aggressive text stripping for VIDEOS. Videos must have zero on-screen text,
 * so this strips everything that could cause a video model to render text:
 * all quoted content, overlay/text/title mentions, etc.
 */
export function stripTextForVideo(description: string): string {
  return description
    // Remove ALL quoted content (straight and smart quotes) — these are dialogue or text overlays
    .replace(new RegExp(`${Q_OPEN}${Q_INNER}{2,}${Q_CLOSE}`, 'g'), '')
    // "Text: something" / "Title: something" etc. — with or without quotes
    .replace(/\b(?:text|title|headline|caption|subtitle|tagline|heading)\s*:\s*[^.;\n]*/gi, '')
    // "overlay" anything
    .replace(/\boverlay\b[^.;\n]*/gi, '')
    // "on-screen text/words"
    .replace(/on[- ]?screen\s+(?:text|words?)\b[^.;]*/gi, '')
    // "text appears" / "text reads" / "text saying" / "text floats"
    .replace(/\btext\s+(?:appear|read|say|float|fade|slide|pop|show|display)\w*\b[^.;]*/gi, '')
    // "showing text" / "displaying text" / "featuring text"
    .replace(/(?:show(?:ing|s)?|display(?:ing|s)?|featuring?)\s+(?:the\s+)?(?:text|words?|title|caption)\b[^.;]*/gi, '')
    // "words appear" / "words float"
    .replace(/\bwords?\s+(?:appear|float|fade|slide|pop|show)\w*\b[^.;]*/gi, '')
    // "with text" anything
    .replace(/with\s+(?:the\s+)?text\b[^.;]*/gi, '')
    // "narration:" / "voiceover:" lines (dialogue already extracted separately)
    .replace(/(?:narrat(?:ion|or)|voiceover|voice[- ]?over|speaker)\s*:\s*[^.;\n]*/gi, '')
    // Numbered list items (e.g., "1. Stop using lemons" or "1) Do this") — look like captions
    .replace(/\b\d+[.)]\s+[^.;\n]*/g, '')
    // Hashtag-style text (#skincare, #wellness)
    .replace(/#\w+/g, '')
    // "Label:" patterns — any word followed by colon then content looks like a title card
    .replace(/\b[A-Z][a-zA-Z]+\s*:\s*[^.;\n]*/g, '')
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
 * Detect whether a visual description contains slide markers.
 */
export function hasSlideMarkers(visualDescription: string): boolean {
  // Match at least 2 slide indicators in the text
  const markers = visualDescription.match(/(?:\[Slide\s*\d|Slide\s*\d\s*[:\-–—.]|\(Slide\s*\d)/gi);
  return (markers?.length ?? 0) >= 2;
}

/**
 * Parse a visual description into individual slides for carousels.
 * Handles many Notion description formats:
 *   [Slide 1] ... [Slide 2] ...
 *   Slide 1: ... Slide 2: ...
 *   Slide 1 - ... Slide 2 - ...
 *   (Slide 1) ... (Slide 2) ...
 */
export function parseSlides(visualDescription: string): string[] {
  // Strategy 1: [Slide N] or [Slide N-M] with brackets
  const bracketPattern = /\[Slide\s*\d+(?:\s*[-–—]\s*\d+)?\]\s*/gi;
  if (bracketPattern.test(visualDescription)) {
    const parts = visualDescription.split(bracketPattern).filter((s) => s.trim());
    if (parts.length >= 2) return cleanParts(visualDescription, parts, bracketPattern);
  }

  // Strategy 2: (Slide N) with parentheses
  const parenPattern = /\(Slide\s*\d+\)\s*/gi;
  if (parenPattern.test(visualDescription)) {
    const parts = visualDescription.split(parenPattern).filter((s) => s.trim());
    if (parts.length >= 2) return cleanParts(visualDescription, parts, parenPattern);
  }

  // Strategy 3: "Slide N:" or "Slide N -" or "Slide N." with various separators
  const sepPattern = /Slide\s*\d+\s*[:\-–—.]\s*/gi;
  if (sepPattern.test(visualDescription)) {
    const parts = visualDescription.split(sepPattern).filter((s) => s.trim());
    if (parts.length >= 2) return cleanParts(visualDescription, parts, sepPattern);
  }

  // Strategy 4: "Slide N " (just space, no separator) — looser match
  const loosePattern = /Slide\s*\d+\s+/gi;
  const looseMatches = visualDescription.match(loosePattern);
  if (looseMatches && looseMatches.length >= 2) {
    const parts = visualDescription.split(loosePattern).filter((s) => s.trim());
    if (parts.length >= 2) return cleanParts(visualDescription, parts, loosePattern);
  }

  return [visualDescription.trim()];
}

/** Remove preamble text that appears before the first slide marker */
function cleanParts(original: string, parts: string[], pattern: RegExp): string[] {
  // Reset the regex since we used .test() which advances lastIndex
  pattern.lastIndex = 0;
  const firstMatch = original.search(pattern);
  if (firstMatch > 20) {
    // There's significant text before the first slide marker (preamble)
    // The first element in parts is the preamble — remove it
    return parts.slice(1).map((s) => s.trim()).filter((s) => s.length > 0);
  }
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Build the right prompts based on content type analysis.
 * Returns an array of prompts — 1 for single images, N for carousels.
 *
 * ANY content type with slide markers in its visual description generates
 * multiple images (carousel), regardless of the contentType label.
 */
export function buildSlidePrompts(
  entry: NotionEntry,
  previousFeedback?: VerificationResult | null
): string[] {
  const category = getContentCategory(entry.contentType);
  const aspectRatio = getAspectRatio(entry.contentType);

  // If the visual description contains slide markers, treat it as a carousel
  // regardless of the content type label (e.g. "1:1 Graphic" with slides)
  const isMultiSlide = category === 'carousel' || hasSlideMarkers(entry.visualDescription);

  if (isMultiSlide) {
    return buildCarouselPrompts(entry, aspectRatio, previousFeedback);
  }

  switch (category) {
    case 'photo':
      return [buildPhotoPrompt(entry, aspectRatio, previousFeedback)];

    case 'graphic':
      return [buildGraphicPrompt(entry, aspectRatio, previousFeedback)];

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

  let prompt = `Create a professional, high-quality Instagram photo.

Topic: ${entry.topic}
Visual direction: ${cleanVisual}

Requirements:
- This is a PHOTOGRAPH — create a realistic, high-resolution photo (not a graphic or illustration)
- Aspect ratio: ${aspectRatio}
- Follow the visual direction EXACTLY — match the described style, mood, scene, and composition precisely
- Instagram-ready quality with professional lighting and color grading
- When depicting people, feature WOMEN — this content is for a female-focused audience
- Do NOT add any text, titles, captions, labels, handles, usernames, or watermarks on the image`;

  return appendFeedback(prompt, previousFeedback);
}

function buildGraphicPrompt(
  entry: NotionEntry,
  aspectRatio: string,
  previousFeedback?: VerificationResult | null
): string {
  const cleanVisual = stripTextInstructions(entry.visualDescription);

  let prompt = `Create a professional Instagram GRAPHIC/INFOGRAPHIC.

Topic: ${entry.topic}
Visual direction: ${cleanVisual}

Requirements:
- This is a DESIGNED GRAPHIC — create a polished, branded design (not a photograph)
- Follow the visual direction EXACTLY — match the described style, layout, color palette, and artistic approach precisely
- Aspect ratio: ${aspectRatio}
- Typography: If the visual direction describes text content, include clean, modern, highly readable text
- Layout: Well-organized with clear visual hierarchy
- When depicting people or illustrations, feature WOMEN — this content is for a female-focused audience
- Instagram-ready, no watermarks, no social media handles or @mentions`;

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

    let prompt = `Create a professional Instagram carousel ${slideLabel}.

Topic: ${entry.topic}
This slide's content: ${cleanSlide}
${isFirst ? 'This is the COVER SLIDE — it should be eye-catching and draw people to swipe.' : 'This is an inner slide — it should contain the described information clearly.'}

Requirements:
- Aspect ratio: ${aspectRatio} (4:5 portrait format)
- Follow the visual direction EXACTLY — match the described style, illustrations, and artistic approach precisely
- Maintain consistent styling across all slides in this carousel
- If the description calls for a graphic or illustrated style, create that — not a photograph
- When depicting people, feature WOMEN — this content is for a female-focused audience
- Instagram-ready, no watermarks, no social media handles or @mentions`;

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

  let prompt = `Create a professional Instagram ${format} COVER THUMBNAIL.

Topic: ${entry.topic}
Video description: ${cleanVisual}

Requirements:
- This is a COVER THUMBNAIL for a ${format} — create a single eye-catching static image that represents the video content
- Follow the visual direction EXACTLY — match the described mood, setting, and style precisely
- The thumbnail should make viewers want to watch the ${format.toLowerCase()}
- Aspect ratio: ${aspectRatio}
- Show the key visual element from the video description as a still frame
- Add a subtle cinematic feel to indicate this is for video
- When depicting people, feature WOMEN — this content is for a female-focused audience
- Instagram-ready, no watermarks
- Do NOT add any text, titles, captions, labels, handles, or usernames on the image`;

  return appendFeedback(prompt, previousFeedback);
}

function buildStoryPrompt(
  entry: NotionEntry,
  previousFeedback?: VerificationResult | null
): string {
  const cleanVisual = stripTextInstructions(entry.visualDescription);

  let prompt = `Create a professional Instagram Story image.

Topic: ${entry.topic}
Visual direction: ${cleanVisual}

Requirements:
- This is an Instagram STORY — vertical format, 9:16 aspect ratio
- Follow the visual direction EXACTLY — match the described style, mood, and composition precisely
- Bold, attention-grabbing visuals
- When depicting people, feature WOMEN — this content is for a female-focused audience
- Instagram-ready, no watermarks
- Do NOT add any text, titles, captions, labels, handles, or usernames on the image`;

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
    graphic: 'This should be a designed GRAPHIC/INFOGRAPHIC with clean design, icons, and visual elements.',
    carousel: 'This is a slide from a CAROUSEL — check if it has proper slide-style layout and matches the described artistic style.',
    video_cover: 'This is a COVER THUMBNAIL for a video/reel — it should look like a video thumbnail with cinematic feel. Do NOT penalize it for being a static image.',
    story: 'This is an Instagram STORY image — vertical format, bold visuals.',
  };

  return `You are a visual quality checker for Instagram content. You will receive:
1. An AI-generated image
2. The original visual description/instructions that were used to create it

Content type: ${entry.contentType}
${categoryContext[category]}

Score the image 1-10 on how well it matches the instructions. The PRIMARY criteria (80% of the score) is:
- Does it match the described STYLE and ARTISTIC APPROACH? (e.g., if "minimalist vector illustration" is requested, is it a minimalist vector illustration — not a photograph?)
- Does it contain the correct objects, scenes, and elements described?
- Does it match the described mood, color palette, and composition?

Secondary criteria (20% of the score):
- Is it high quality and Instagram-ready?
- Does it avoid unwanted elements (watermarks, distortion, wrong aspect ratio, social media handles)?
- If visible text/watermarks appear on the image, note it in unwanted_elements and deduct 1 point
${category === 'video_cover' ? '- For video thumbnails: DO NOT penalize for being a static image. Score based on whether it makes a good thumbnail for the described video content.' : ''}

Respond with JSON only:
{
  "score": <1-10>,
  "matches": <true if score >= 7>,
  "feedback": "<specific feedback on what matches and what doesn't>",
  "missing_elements": ["<list of things from description not present in image>"],
  "unwanted_elements": ["<list of things in image not asked for>"]
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
