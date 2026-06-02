/**
 * Image generator — walks a `ComicScript` and produces a PNG Buffer
 * for every panel, in parallel with a bounded worker pool.
 *
 * For each panel, we build an image prompt:
 *   "{artStyle} style. {panel.description}. Comic panel, cinematic composition."
 *
 * (If the panel has an explicit `imagePrompt`, that wins.)
 *
 * Each generated Buffer is stored in a `Map<panelId, Buffer>` keyed by
 * the panel's stable id, so downstream code (assembler) can look it up
 * without caring about order.
 *
 * Concurrency is bounded via a small worker pool. With the default of 4
 * workers this is polite to remote APIs (image gen is slow & expensive)
 * and keeps memory usage flat regardless of how many panels the script
 * has.
 */

import type { ComicScript, Panel } from '../types.js';
import type { ImageProvider } from '../providers/index.js';

export interface ImageGeneratorOptions {
  artStyle?: string; // default 'manga'
  width?: number; // default 1024
  height?: number; // default 1024
  concurrency?: number; // default 4
  /**
   * Deterministic seed forwarded to the image provider so a re-run
   * with the same script yields the same images. Used by the index.ts
   * entrypoint — not all providers honor it.
   */
  seed?: number;
  /**
   * Optional model override. Forwarded to `imageProvider.generate(prompt,
   * { model })`. Falls back to the provider's configured default if
   * unset. Empty string is treated the same as unset.
   */
  model?: string;
}

// -- Worker pool ------------------------------------------------------------

/**
 * Run `worker(item)` over `items` in parallel, with at most `concurrency`
 * jobs in flight at any time. Order of results matches order of `items`.
 *
 * - Errors from a worker reject the whole pool. We don't silently skip
 *   a failed panel — that would leave the assembler rendering a blank
 *   box. The caller can decide whether to retry.
 * - If `items` is empty, returns an empty array.
 */
async function workerPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  const cap = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  async function run(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!, i);
    }
  }

  const runners = Array.from({ length: cap }, () => run());
  await Promise.all(runners);
  return results;
}

// -- Prompt construction ---------------------------------------------------

function buildImagePrompt(panel: Panel, artStyle: string): string {
  // Panel.imagePrompt (if set) is the raw visual description; the style
  // is still prepended so a caller who overrides the prompt doesn't lose
  // the art direction. The user can suppress the style entirely by
  // starting their override with `[no-style]`.
  const description = panel.imagePrompt ?? panel.description;
  if (description.trim().startsWith('[no-style]')) {
    return description.trim().slice('[no-style]'.length).trim();
  }
  return `${artStyle} style. ${description}. Comic panel, cinematic composition.`;
}

// -- Public entry point -----------------------------------------------------

/**
 * Generate one PNG Buffer per panel in `script`.
 *
 * Returns a `Map<panelId, Buffer>` keyed by the panel's stable id
 * (e.g. "p1-panel1"). The order of generation is parallel; the returned
 * map is NOT insertion-ordered by panel — it just maps panelId to bytes.
 */
export async function generatePanelImages(
  script: ComicScript,
  options: ImageGeneratorOptions,
  imageProvider: ImageProvider
): Promise<Map<string, Buffer>> {
  const artStyle = options.artStyle ?? 'manga';
  const width = options.width ?? 1024;
  const height = options.height ?? 1024;
  const concurrency = options.concurrency ?? 4;

  // Flatten every panel across every page, in reading order.
  type Item = { panel: Panel; prompt: string };
  const items: Item[] = [];
  for (const page of script.pages) {
    for (const panel of page.panels) {
      items.push({ panel, prompt: buildImagePrompt(panel, artStyle) });
    }
  }

  const buffers = await workerPool(items, concurrency, async (item) => {
    return imageProvider.generate(item.prompt, {
      width,
      height,
      ...(options.model ? { model: options.model } : {}),
    });
  });

  const out = new Map<string, Buffer>();
  for (let i = 0; i < items.length; i++) {
    out.set(items[i]!.panel.id, buffers[i]!);
  }
  return out;
}
