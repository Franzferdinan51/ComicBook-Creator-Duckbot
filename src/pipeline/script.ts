/**
 * Script generator — turns a free-form story into a structured `ComicScript`
 * (title + artStyle + N pages × M panels with dialogue / caption).
 *
 * Pipeline:
 *   1. Build a prompt that asks the LLM for a strict JSON ComicScript
 *      with a specific page / panel count and art style.
 *   2. Call `textProvider.complete(prompt, { system })`.
 *   3. Try to extract a JSON object from the response — handles
 *      pure JSON, markdown-fenced JSON, and JSON embedded in prose.
 *   4. If extraction fails, retry once with a stricter "ONLY JSON, no
 *      markdown" instruction.
 *   5. If the second attempt also fails, fall back to a deterministic
 *      script synthesized from the story (this is the v1 safety net so
 *      mock providers and flaky real models don't hard-fail the pipeline).
 *   6. After parsing, enforce:
 *        - the requested page count
 *        - the requested panelsPerPage (pad / trim as needed)
 *        - stable panel ids `p{pageNumber}-panel{panelIndex}` (1-indexed)
 *        - sane per-panel `description` (fall back to a placeholder)
 */

import type { ComicScript, Page, PageLayout, Panel, ProjectGoal } from '../types.js';
import type { TextProvider } from '../providers/index.js';

export interface ScriptGeneratorOptions {
  pageCount?: number; // default 4
  panelsPerPage?: number; // default 4
  artStyle?: string; // default 'manga'
  projectGoal?: ProjectGoal; // default 'comic'
  /**
   * Optional model override forwarded to the text provider. Empty
   * string is treated the same as unset. Falls back to the provider's
   * configured default.
   */
  model?: string;
}

// -- Prompt construction ----------------------------------------------------

const SYSTEM_PROMPT = [
  'You are a comic-book script writer.',
  'You always respond with a single JSON object — no prose, no markdown fences.',
  'The JSON object has this exact shape:',
  '{',
  '  "title": string,',
  '  "artStyle": string,',
  '  "pages": [',
  '    {',
  '      "pageNumber": number,                // 1-indexed',
  '      "layout": "grid-2x2" | "grid-2x3" | "strip-3" | "custom",',
  '      "panels": [',
  '        {',
  '          "id": "p1-panel1",              // p{pageNumber}-panel{index}, 1-indexed',
  '          "description": string,           // visual description for the image model',
  '          "dialogue": string[]   (optional),',
  '          "caption":   string    (optional)',
  '        }',
  '      ]',
  '    }',
  '  ]',
  '}',
].join('\n');

const STRICT_RETRY_SUFFIX =
  '\n\nIMPORTANT: Respond with ONLY the JSON object. No markdown, no commentary, no code fences.';

function buildScriptPrompt(story: string, opts: Required<ScriptGeneratorOptions>): string {
  const layoutHint =
    opts.panelsPerPage === 6
      ? 'grid-2x3'
      : opts.panelsPerPage === 3
        ? 'strip-3'
        : 'grid-2x2';

  return [
    `Story: ${story.trim()}`,
    '',
    `Produce a ${opts.pageCount}-page comic script with exactly ${opts.panelsPerPage} panels per page (suggested layout: "${layoutHint}").`,
    `Art style: ${opts.artStyle}.`,
    `Project goal: ${opts.projectGoal ?? 'comic'}.`,
    '',
    'Constraints:',
    `- Exactly ${opts.pageCount} entries in the "pages" array.`,
    `- Each page must have exactly ${opts.panelsPerPage} entries in its "panels" array.`,
    '- Panel ids must follow the pattern "p{pageNumber}-panel{panelIndex}" (1-indexed).',
    '- Each panel must have a vivid "description" suitable for an image model.',
    '- Include at least one panel of dialogue or a caption on each page.',
    '',
    'Return ONLY the JSON object. No markdown, no code fences, no preamble.',
  ].join('\n');
}

// -- JSON extraction --------------------------------------------------------

/**
 * Try hard to pull a JSON object out of `text`. Handles:
 *   - pure JSON
 *   - ```json ... ``` fenced JSON
 *   - ``` ... ``` fenced JSON
 *   - JSON embedded in surrounding prose
 *
 * Returns the parsed object, or null on failure.
 */
export function extractJSON(text: string): Record<string, unknown> | null {
  if (!text) return null;
  let s = text.trim();

  // Strip a leading/trailing ```...``` fence (with or without a language tag).
  const fence = /^```(?:json|JSON)?\s*([\s\S]*?)\s*```\s*$/;
  const fenced = s.match(fence);
  if (fenced) s = fenced[1]!.trim();

  // If the string is already valid JSON, take it as-is.
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through to substring extraction */
  }

  // Otherwise look for the first '{' and the matching closing '}'.
  // We use a small brace-counter to be tolerant of nested braces in
  // strings (escapes are not fully handled, but that's fine for the
  // typical LLM output we get).
  const first = s.indexOf('{');
  if (first < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastClose = -1;
  for (let i = first; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        lastClose = i;
        break;
      }
    }
  }
  if (lastClose < 0) return null;
  const candidate = s.slice(first, lastClose + 1);
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

// -- Normalization / validation --------------------------------------------

function defaultLayout(panelsPerPage: number): PageLayout {
  if (panelsPerPage === 6) return 'grid-2x3';
  if (panelsPerPage === 3) return 'strip-3';
  if (panelsPerPage <= 2) return 'strip-3';
  return 'grid-2x2';
}

function coercePage(
  rawPage: unknown,
  pageNumber: number,
  panelsPerPage: number,
  artStyle: string
): Page {
  const r = (rawPage && typeof rawPage === 'object'
    ? (rawPage as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  // Pull the panels array (or empty).
  const rawPanels = Array.isArray(r.panels) ? r.panels : [];

  const panels: Panel[] = [];
  for (let i = 0; i < panelsPerPage; i++) {
    const raw = rawPanels[i];
    const obj = (raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    const description =
      (typeof obj.description === 'string' && obj.description.trim()) ||
      `${artStyle} comic panel ${pageNumber}-${i + 1}`;

    const dialogue = Array.isArray(obj.dialogue)
      ? (obj.dialogue.filter((d) => typeof d === 'string') as string[])
      : undefined;

    const caption =
      typeof obj.caption === 'string' && obj.caption.trim()
        ? (obj.caption as string)
        : undefined;

    const panel: Panel = {
      id: `p${pageNumber}-panel${i + 1}`,
      description,
    };
    if (dialogue && dialogue.length) panel.dialogue = dialogue;
    if (caption) panel.caption = caption;
    panels.push(panel);
  }

  const layout =
    r.layout === 'grid-2x2' ||
    r.layout === 'grid-2x3' ||
    r.layout === 'strip-3' ||
    r.layout === 'custom'
      ? (r.layout as PageLayout)
      : defaultLayout(panelsPerPage);

  return { pageNumber, panels, layout };
}

function normalizeScript(
  raw: Record<string, unknown> | null,
  opts: ScriptGeneratorOptions,
  storyTitle: string
): ComicScript {
  const title =
    (raw && typeof raw.title === 'string' && raw.title.trim()) ||
    `${storyTitle} — A Comic`;

  const artStyle =
    (raw && typeof raw.artStyle === 'string' && raw.artStyle.trim()) ||
    opts.artStyle ||
    'manga';

  const pageCount = opts.pageCount ?? 4;
  const panelsPerPage = opts.panelsPerPage ?? 4;

  const rawPages = raw && Array.isArray(raw.pages) ? raw.pages : [];
  const pages: Page[] = [];
  for (let p = 0; p < pageCount; p++) {
    pages.push(coercePage(rawPages[p], p + 1, panelsPerPage, artStyle));
  }

  return { title, artStyle, pages };
}

// -- Deterministic fallback (v1 safety net) ---------------------------------

function deterministicScript(
  story: string,
  opts: Required<ScriptGeneratorOptions>
): ComicScript {
  const trimmed = story.trim() || 'An Untold Story';
  // Make a short story title (first ~40 chars, first sentence if possible).
  const firstSentence = trimmed.split(/[.!?\n]/)[0]?.trim() ?? trimmed;
  const title =
    firstSentence.length > 0
      ? firstSentence.slice(0, 60).replace(/\s+\S*$/, '') + ' — A Comic'
      : 'An Untold Story — A Comic';

  const verbs = ['discovers', 'explores', 'finds', 'meets', 'faces', 'reveals', 'transforms', 'conquers'];
  const moods = ['quietly', 'suddenly', 'in secret', 'with courage', 'in confusion', 'with joy', 'in sorrow'];
  const places = ['a hidden garden', 'a glowing cave', 'a bustling market', 'a lonely shore', 'a starlit sky', 'a forgotten city'];

  const pages: Page[] = [];
  for (let p = 0; p < opts.pageCount; p++) {
    const panels: Panel[] = [];
    for (let i = 0; i < opts.panelsPerPage; i++) {
      const v = verbs[(p * opts.panelsPerPage + i) % verbs.length]!;
      const m = moods[(p * opts.panelsPerPage + i) % moods.length]!;
      const pl = places[(p * opts.panelsPerPage + i) % places.length]!;
      const description = `${opts.artStyle} comic panel. ${trimmed}. The hero ${v} ${m} ${pl}.`;
      const panel: Panel = {
        id: `p${p + 1}-panel${i + 1}`,
        description,
      };
      if (i === 0) panel.caption = `Page ${p + 1}.`;
      if (i === opts.panelsPerPage - 1) panel.dialogue = ['To be continued...'];
      panels.push(panel);
    }
    pages.push({
      pageNumber: p + 1,
      panels,
      layout: defaultLayout(opts.panelsPerPage),
    });
  }
  return { title, artStyle: opts.artStyle, pages };
}

// -- Public entry point -----------------------------------------------------

export async function generateScript(
  story: string,
  options: ScriptGeneratorOptions,
  textProvider: TextProvider
): Promise<ComicScript> {
  const opts: Required<ScriptGeneratorOptions> = {
    pageCount: options.pageCount ?? 4,
    panelsPerPage: options.panelsPerPage ?? 4,
    artStyle: options.artStyle ?? 'manga',
    projectGoal: options.projectGoal ?? 'comic',
    model: options.model ?? '',
  };

  // A short, deterministic title used in the deterministic fallback.
  const storyTitle =
    story.trim().split(/[.!?\n]/)[0]?.trim().slice(0, 40) || 'Untitled';

  const userPrompt = buildScriptPrompt(story, opts);

  // --- Attempt 1: ask nicely -------------------------------------------------
  let lastRaw = '';
  const completeOpts = {
    system: SYSTEM_PROMPT,
    ...(opts.model ? { model: opts.model } : {}),
  };
  try {
    lastRaw = await textProvider.complete(userPrompt, completeOpts);
    const parsed = extractJSON(lastRaw);
    if (parsed) {
      return normalizeScript(parsed, opts, storyTitle);
    }
  } catch (e) {
    // network / API error — bubble up after the retry
    lastRaw = `[provider error: ${(e as Error).message}]`;
  }

  // --- Attempt 2: strict retry ----------------------------------------------
  try {
    lastRaw = await textProvider.complete(userPrompt + STRICT_RETRY_SUFFIX, completeOpts);
    const parsed = extractJSON(lastRaw);
    if (parsed) {
      return normalizeScript(parsed, opts, storyTitle);
    }
  } catch (e) {
    lastRaw = `[provider error: ${(e as Error).message}]`;
  }

  // --- Fallback: deterministic script ---------------------------------------
  // We deliberately don't throw here. The pipeline should still produce a
  // valid ComicScript even when the LLM misbehaves (mock provider, rate
  // limit, schema drift, etc.). Real users get a useful comic; power users
  // can detect the fallback by checking panel description text.
  return deterministicScript(story, opts);
}
