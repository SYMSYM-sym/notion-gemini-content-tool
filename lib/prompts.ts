import { NotionEntry, VerificationResult } from './types';

export type ContentCategory = 'photo' | 'graphic' | 'carousel' | 'video_cover' | 'story';

/** All quote characters (straight + smart/curly) */
const Q = `["'\u201C\u201D\u2018\u2019]`;
const Q_OPEN = `["'\u201C\u2018]`;
const Q_CLOSE = `["'\u201D\u2019]`;
const Q_INNER = `[^"'\u201C\u201D\u2018\u2019]`;

/**
 * Strip text/overlay instructions from a visual description for IMAGES.
 * Removes explicit text overlay instructions and specific quoted text content
 * that would render as on-screen text. Preserves style and artistic directions.
 */
export function stripTextInstructions(description: string): string {
  return description
    // "Text: '...'" or "Text: "..."" — explicit text overlay instructions
    .replace(new RegExp(`\\btext\\s*:\\s*${Q_OPEN}${Q_INNER}+${Q_CLOSE}`, 'gi'), '')
    // "Title: '...'" / "Headline: '...'" etc. — explicit label overlays with quoted content
    .replace(new RegExp(`\\b(?:title|headline|caption|subtitle|tagline|heading|slogan)\\s*:\\s*${Q_OPEN}${Q_INNER}+${Q_CLOSE}`, 'gi'), '')
    // "with text '...'" / "with the text '...'"
    .replace(new RegExp(`with\\s+(?:the\\s+)?text\\s+${Q_OPEN}${Q_INNER}+${Q_CLOSE}`, 'gi'), '')
    // "text overlay" / "on-screen text" / "overlay text" phrases
    .replace(/text\s+overlay\b[^.;]*/gi, '')
    .replace(/on[- ]?screen\s+text\b[^.;]*/gi, '')
    .replace(/overlay\s+text\b[^.;]*/gi, '')
    // "overlay: '...'" — explicit overlay with quoted content
    .replace(new RegExp(`overlay\\s*:\\s*${Q_OPEN}${Q_INNER}+${Q_CLOSE}`, 'gi'), '')
    // "labeled X, Y, Z" / "labelled" — specific label content
    .replace(/\b(?:labeled|labelled)\s+[^.;]*/gi, '')
    // "reading '...'" / "that says '...'" — specific text on objects
    .replace(new RegExp(`\\b(?:reading|says?|showing)\\s+${Q_OPEN}${Q_INNER}+${Q_CLOSE}`, 'gi'), '')
    // Hashtags
    .replace(/#\w+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Aggressive text stripping for VIDEOS. fal.ai LTX v2.3 renders text in two ways:
 *   1. Subtitle/caption overlays — triggered by dialogue, narration, colon patterns
 *   2. Text on scene objects (cards, signs, screens) — triggered by educational/
 *      presentation language and any object that could physically bear text
 *
 * This function must eliminate BOTH vectors. When in doubt, strip it out —
 * a slightly vague visual description is far better than one that triggers text.
 */
export function stripTextForVideo(description: string): string {
  return description
    // ── Phase 1: Remove structured text patterns ──
    // ALL quoted content — dialogue, overlay instructions, emphasis
    .replace(new RegExp(`${Q_OPEN}${Q_INNER}{2,}${Q_CLOSE}`, 'g'), '')
    // ANY colon pattern — "anything: content" renders as title cards
    .replace(/[^.;\n]{1,50}:\s*[^.;\n]*/g, '')
    // Numbered/bulleted list items — look like captions
    .replace(/\b\d+[.)]\s+[^.;\n]*/g, '')
    // Dash-prefixed list items
    .replace(/(?:^|\n)\s*[-–—•]\s+[^\n]*/g, '')

    // ── Phase 2: Remove text-rendering action words ──
    // Verbs that describe visible text or presenting information — the model renders what it reads
    .replace(/\b(?:reading|reads|labeled|labelled|engraved|printed|written|stamped|inscribed|says?|showing|displaying|presenting|holding up|flipping|revealing|pointing (?:to|at)|turning pages?|opening|unfolding)\s+[^.;\n]*/gi, '')

    // ── Phase 3: Remove ALL text-bearing objects ──
    // Any clause containing an object that could physically display text.
    // This is the most critical rule — fal.ai loves to generate people holding/showing these.
    .replace(/[^.;]*\b(?:poster|sign|banner|billboard|placard|board|screen|label|badge|sticker|card|paper|note|book|journal|notebook|magazine|phone|tablet|laptop|whiteboard|flashcard|cue card|page|document|letter|envelope|menu|chart|graph|diagram|infographic|checklist|recipe|calendar|planner|clipboard|folder|binder|pamphlet|brochure|flyer|ticket|certificate|diploma|scroll|monitor|display|tv|television)\b[^.;]*/gi, '')

    // ── Phase 4: Remove educational/presentation language ──
    // Topic words that make fal.ai generate "someone teaching/explaining" scenes with text props
    .replace(/\b(?:tips?|steps?|routine|guide|how[- ]?to|tutorial|demonstrat\w*|summar\w*|recap\w*|overview|agenda|timeline|schedule|breakdown|ingredients?|product names?|brand names?|checklist|lesson|lecture|workshop|webinar|presentation|slideshow|bullet points?)\b[^.;]*/gi, '')

    // ── Phase 5: Remove text/overlay concept words ──
    .replace(/\b(?:overlay|on[- ]?screen|watermark|subtitle|caption|title card|heading|headline|tagline|slogan|motto|quote|citation|footnote|annotation|callout)\b[^.;]*/gi, '')
    .replace(/\btext\b[^.;]*/gi, '')

    // ── Phase 6: Remove speech/narration instructions ──
    .replace(/\b(?:narrat\w*|voiceover|voice[- ]?over|speaker|speech|speaks?|dialogue|monologue|script)\b[^.;\n]*/gi, '')

    // ── Phase 7: Remove misc text triggers ──
    // Hashtags
    .replace(/#\w+/g, '')
    // ALL-CAPS words (3+ chars) — render as labels/headings
    .replace(/\b[A-Z]{3,}\b/g, '')
    // Comma-separated short phrase lists — look like subtitle lines
    .replace(/(?:(?:^|[.;])\s*)(?:[^,.;]{3,30},\s*){3,}[^,.;]{3,30}(?=[.;]|$)/g, '')

    // ── Phase 8: Cleanup ──
    .replace(/\.\s*[^.]{1,14}\s*\./g, '.')  // orphaned short fragments
    .replace(/\.\s*\.+/g, '.')               // orphaned periods
    .replace(/\s{2,}/g, ' ')                 // multiple spaces
    .replace(/^\s*\.\s*/, '')                // leading dots
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
  previousFeedback?: VerificationResult | null,
  theme?: string
): string[] {
  const category = getContentCategory(entry.contentType);
  const aspectRatio = getAspectRatio(entry.contentType);

  // If the visual description contains slide markers, treat it as a carousel
  // regardless of the content type label (e.g. "1:1 Graphic" with slides)
  const isMultiSlide = category === 'carousel' || hasSlideMarkers(entry.visualDescription);

  if (isMultiSlide) {
    return buildCarouselPrompts(entry, aspectRatio, previousFeedback, theme);
  }

  switch (category) {
    case 'photo':
      return [buildPhotoPrompt(entry, aspectRatio, previousFeedback, theme)];

    case 'graphic':
      return [buildGraphicPrompt(entry, aspectRatio, previousFeedback, theme)];

    case 'video_cover':
      return [buildVideoCoverPrompt(entry, aspectRatio, previousFeedback, theme)];

    case 'story':
      return [buildStoryPrompt(entry, previousFeedback, theme)];

    default:
      return [buildPhotoPrompt(entry, aspectRatio, previousFeedback, theme)];
  }
}

function buildPhotoPrompt(
  entry: NotionEntry,
  aspectRatio: string,
  previousFeedback?: VerificationResult | null,
  theme?: string
): string {
  const cleanVisual = stripTextInstructions(entry.visualDescription);

  let prompt = `Create a professional, high-quality Instagram photo.
${theme ? `\nCreative theme: ${theme} — ensure the visual style and mood align with this overarching theme.\n` : ''}
Topic: ${entry.topic}
Visual direction: ${cleanVisual}

Requirements:
- This is a PHOTOGRAPH — create a realistic, high-resolution photo (not a graphic or illustration)
- Aspect ratio: ${aspectRatio}
- Follow the visual direction EXACTLY — match the described style, mood, scene, and composition precisely
- Instagram-ready quality with professional lighting and color grading
- When depicting people, feature WOMEN — this content is for a female-focused audience
- CRITICAL: Do NOT render any text, titles, captions, labels, handles, usernames, watermarks, or written words anywhere on the image — the image must be completely text-free`;

  return appendFeedback(prompt, previousFeedback);
}

function buildGraphicPrompt(
  entry: NotionEntry,
  aspectRatio: string,
  previousFeedback?: VerificationResult | null,
  theme?: string
): string {
  const cleanVisual = stripTextInstructions(entry.visualDescription);

  let prompt = `Create a professional Instagram GRAPHIC/INFOGRAPHIC.
${theme ? `\nCreative theme: ${theme} — ensure the color palette, illustrations, and design language align with this overarching theme.\n` : ''}
Topic: ${entry.topic}
Visual direction: ${cleanVisual}

Requirements:
- This is a DESIGNED GRAPHIC — create a polished, branded design (not a photograph)
- Follow the visual direction EXACTLY — match the described style, layout, color palette, and artistic approach precisely
- Aspect ratio: ${aspectRatio}
- Layout: Well-organized with clear visual hierarchy
- When depicting people or illustrations, feature WOMEN — this content is for a female-focused audience
- Instagram-ready, no watermarks, no social media handles or @mentions
- CRITICAL: Do NOT render any text, titles, captions, labels, handles, usernames, watermarks, or written words anywhere on the image — the image must be completely text-free. Use icons, illustrations, and visual elements to communicate instead of words.`;

  return appendFeedback(prompt, previousFeedback);
}

function buildCarouselPrompts(
  entry: NotionEntry,
  aspectRatio: string,
  previousFeedback?: VerificationResult | null,
  theme?: string
): string[] {
  const slides = parseSlides(entry.visualDescription);

  return slides.map((slideDesc, i) => {
    const isFirst = i === 0;
    const slideLabel = `Slide ${i + 1} of ${slides.length}`;
    const cleanSlide = stripTextInstructions(slideDesc);

    let prompt = `Create a professional Instagram carousel ${slideLabel}.
${theme ? `\nCreative theme: ${theme} — maintain a consistent visual identity across all slides that aligns with this theme.\n` : ''}
Topic: ${entry.topic}
This slide's content: ${cleanSlide}
${isFirst ? 'This is the COVER SLIDE — it should be eye-catching and draw people to swipe.' : 'This is an inner slide — it should contain the described information clearly.'}

Requirements:
- Aspect ratio: ${aspectRatio} (4:5 portrait format)
- Follow the visual direction EXACTLY — match the described style, illustrations, and artistic approach precisely
- Maintain consistent styling across all slides in this carousel
- If the description calls for a graphic or illustrated style, create that — not a photograph
- When depicting people, feature WOMEN — this content is for a female-focused audience
- Instagram-ready, no watermarks, no social media handles or @mentions
- CRITICAL: Do NOT render any text, titles, captions, labels, handles, usernames, watermarks, or written words anywhere on the image — the image must be completely text-free. Use icons, illustrations, and visual elements to communicate instead of words.`;

    return appendFeedback(prompt, previousFeedback);
  });
}

function buildVideoCoverPrompt(
  entry: NotionEntry,
  aspectRatio: string,
  previousFeedback?: VerificationResult | null,
  theme?: string
): string {
  const isReel = entry.contentType.toLowerCase().includes('reel');
  const format = isReel ? 'Reel' : 'Video';
  const cleanVisual = stripTextInstructions(entry.visualDescription);

  let prompt = `Create a professional Instagram ${format} COVER THUMBNAIL.
${theme ? `\nCreative theme: ${theme} — the thumbnail should feel cohesive with the broader content series.\n` : ''}
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
- CRITICAL: Do NOT render any text, titles, captions, labels, handles, usernames, watermarks, or written words anywhere on the image — the image must be completely text-free`;

  return appendFeedback(prompt, previousFeedback);
}

function buildStoryPrompt(
  entry: NotionEntry,
  previousFeedback?: VerificationResult | null,
  theme?: string
): string {
  const cleanVisual = stripTextInstructions(entry.visualDescription);

  let prompt = `Create a professional Instagram Story image.
${theme ? `\nCreative theme: ${theme} — the story should feel part of a cohesive content series.\n` : ''}
Topic: ${entry.topic}
Visual direction: ${cleanVisual}

Requirements:
- This is an Instagram STORY — vertical format, 9:16 aspect ratio
- Follow the visual direction EXACTLY — match the described style, mood, and composition precisely
- Bold, attention-grabbing visuals
- When depicting people, feature WOMEN — this content is for a female-focused audience
- Instagram-ready, no watermarks
- CRITICAL: Do NOT render any text, titles, captions, labels, handles, usernames, watermarks, or written words anywhere on the image — the image must be completely text-free`;

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
- If ANY visible text, words, letters, labels, watermarks, or writing appear anywhere on the image, note it in unwanted_elements and deduct 3 points — text-free output is a hard requirement
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
