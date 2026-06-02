/**
 * comic-creator — main entry point.
 *
 * Wires together providers (text + image), the script + image pipeline,
 * and the page assembler. Other tasks build the providers/ and pipeline/
 * modules to the shape this file imports.
 */

import type { ComicOptions, ComicResult, ComicScript } from './types.js';
export type { ComicOptions, ComicResult, ComicScript, Panel, Page, PageLayout } from './types.js';

// Re-exports so users can import everything from one place
export { getTextProvider, getImageProvider, listTextProviders, listImageProviders } from './providers/index.js';
export type { TextProvider, ImageProvider } from './providers/index.js';
export { generateScript, generatePanelImages } from './pipeline/index.js';
export type { ScriptGeneratorOptions, ImageGeneratorOptions } from './pipeline/index.js';
export { assembleComic } from './assembler/index.js';
export { startWebUI } from './server/index.js';
export type { StartWebUIOptions, WebUIHandle } from './server/index.js';

import { getTextProvider, getImageProvider } from './providers/index.js';
import { generateScript, generatePanelImages } from './pipeline/index.js';
import { assembleComic } from './assembler/index.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/**
 * End-to-end comic generation:
 *   story + options → script → panel images → PDF/CBZ → ComicResult
 */
export async function createComic(
  story: string,
  options: ComicOptions = {}
): Promise<ComicResult> {
  const HOME = process.env.HOME ?? '/tmp';
  const opts = {
    artStyle: options.artStyle ?? 'manga',
    imageProvider: options.imageProvider ?? 'mock',
    textProvider: options.textProvider ?? options.imageProvider ?? 'mock',
    pageCount: options.pageCount ?? 4,
    panelsPerPage: options.panelsPerPage ?? 4,
    outputFormat: options.outputFormat ?? 'pdf',
    outputPath:
      options.outputPath ??
      `${HOME}/.openclaw/workspace/output/comics/${Date.now()}.pdf`,
    seed: options.seed ?? 0,
    imageModel: options.imageModel,
    textModel: options.textModel,
    imageAspectRatio: options.imageAspectRatio,
    imagePromptOptimizer: options.imagePromptOptimizer,
    imageAigcWatermark: options.imageAigcWatermark,
  } as const;

  const textProvider = getTextProvider(opts.textProvider);
  const imageProvider = getImageProvider(opts.imageProvider);

  const script: ComicScript = await generateScript(
    story,
    {
      pageCount: opts.pageCount,
      panelsPerPage: opts.panelsPerPage,
      artStyle: opts.artStyle,
      // Forward the text-model override so the LLM call uses the user's
      // choice. Providers that don't support per-call models ignore it.
      ...(opts.textModel ? { model: opts.textModel } : {}),
    },
    textProvider
  );
  const images = await generatePanelImages(
    script,
    {
      artStyle: opts.artStyle,
      seed: opts.seed,
      ...(opts.imageModel ? { model: opts.imageModel } : {}),
      ...(opts.imageAspectRatio ? { aspectRatio: opts.imageAspectRatio } : {}),
      ...(opts.imagePromptOptimizer ? { promptOptimizer: true } : {}),
      ...(opts.imageAigcWatermark ? { aigcWatermark: true } : {}),
    },
    imageProvider
  );

  const outputPath = await assembleComic(script, images, {
    outputPath: opts.outputPath,
    format: opts.outputFormat,
  });

  // Pre-render the OTHER format too so the user can download whichever
  // they want at view time without waiting. Both files are written next
  // to the primary output (just with a different extension) and exposed
  // via the API. PDF assembly is the expensive one; CBZ is just a zip
  // of the already-saved panel images, so it's effectively free.
  //
  // If the user's chosen outputFormat is 'pdf' we additionally build
  // 'foo.cbz' at the same stem, and vice versa. If for any reason the
  // secondary build fails (out of disk, race condition), we log and
  // continue — the user can still download the primary format.
  const otherFormat: 'pdf' | 'cbz' = opts.outputFormat === 'pdf' ? 'cbz' : 'pdf';
  const otherPath = outputPath.replace(/\.[^./\\]+$/, '') + '.' + otherFormat;
  let cbzPath: string | null = null;
  let pdfPath: string | null = null;
  if (opts.outputFormat === 'pdf') {
    pdfPath = outputPath;
    try {
      await assembleComic(script, images, { outputPath: otherPath, format: 'cbz' });
      cbzPath = otherPath;
    } catch (err) {
      console.warn(`[createComic] secondary CBZ assembly failed: ${(err as Error).message}`);
    }
  } else {
    cbzPath = outputPath;
    try {
      await assembleComic(script, images, { outputPath: otherPath, format: 'pdf' });
      pdfPath = otherPath;
    } catch (err) {
      console.warn(`[createComic] secondary PDF assembly failed: ${(err as Error).message}`);
    }
  }

  // Save a copy of each panel image next to the PDF for inspection.
  // We keep the original format (PNG or JPEG) — different providers return
  // different encodings. The route layer detects the format and serves with
  // the right mime type.
  //
  // The image directory is per-job (sibling to the PDF) so two comics in the
  // same parent directory don't trample each other's panel images.
  const stem = outputPath.replace(/\.[^./\\]+$/, '');
  const imageDir = `${stem}.images`;
  await mkdir(imageDir, { recursive: true });
  const pageImages: ComicResult['pages'] = [];
  for (const page of script.pages) {
    const panelImagePaths: string[] = [];
    for (const panel of page.panels) {
      const buf = images.get(panel.id);
      if (!buf) {
        // No image was generated for this panel (provider failure or
        // rate-limit). Skip — the assembler will render an empty cell.
        continue;
      }
      const ext = detectImageFormat(buf);
      const imagePath = join(imageDir, `${panel.id}.${ext}`);
      await writeFile(imagePath, buf);
      panelImagePaths.push(imagePath);
    }
    pageImages.push({
      page,
      imagePath: panelImagePaths[0] ?? '',
      panelImagePaths,
      layout: page.layout,
    });
  }

  return { script, outputPath, pdfPath, cbzPath, pages: pageImages };
}

/** Detect image format from the first 3 bytes. Returns "png" or "jpg". */
export function detectImageFormat(buf: Buffer): 'png' | 'jpg' {
  // PNG magic: 89 50 4E 47
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'png';
  }
  // JPEG magic: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpg';
  }
  // Default to png if we can't tell — keeps legacy behavior.
  return 'png';
}

/** Map the image format to the right mime type. */
export function mimeForImageFormat(ext: 'png' | 'jpg'): 'image/png' | 'image/jpeg' {
  return ext === 'jpg' ? 'image/jpeg' : 'image/png';
}

// Default export for `import comicCreator from 'comic-creator'`
export default { createComic };
