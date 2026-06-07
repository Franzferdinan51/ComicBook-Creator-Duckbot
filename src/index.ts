/**
 * comic-creator — main entry point.
 *
 * Wires together providers (text + image), the script + image pipeline,
 * and the page assembler. Other tasks build the providers/ and pipeline/
 * modules to the shape this file imports.
 */

import type { ComicOptions, ComicResult, ComicScript } from './types.js';

export interface StartWebUIOptions {
  port?: number;
  webuiDir?: string;
  corsOrigin?: string | true;
}

export interface WebUIHandle {
  port: number;
  app: unknown;
  close: () => Promise<void>;
}

export type {
  ComicOptions,
  ComicResult,
  ComicScript,
  Panel,
  Page,
  PageLayout,
  RenderProfile,
  StoryProject,
  StoryBible,
  AdaptationPackage,
  SeriesPackage,
  TrailerPackage,
  MusicCuePackage,
  AgentGuidancePackage,
  ProductionRunManifest,
  ProjectGoal,
  OutputProfile,
} from './types.js';
export type { PreflightCheck, PreflightReport, PreflightStatus } from './project/index.js';

// Re-exports so users can import everything from one place
export { getTextProvider, getImageProvider, getMusicProvider, listTextProviders, listImageProviders, listMusicProviders } from './providers/index.js';
export type { TextProvider, ImageProvider, MusicProvider } from './providers/index.js';
export { generateScript, generatePanelImages } from './pipeline/index.js';
export type { ScriptGeneratorOptions, ImageGeneratorOptions } from './pipeline/index.js';
export { assembleComic } from './assembler/index.js';
export {
  buildStoryProject,
  normalizeRenderProfile,
  buildAgentGuidancePackage,
  buildAgentWorkflowPackage,
  buildProductionRunManifest,
  renderAgentGuidanceMarkdown,
  renderScreenplayMarkdown,
  renderDirectorBriefMarkdown,
  renderSongSheetMarkdown,
  buildStoryboardPackage,
  buildAnimaticTimeline,
  buildVideoPackage,
  buildSeriesPackage,
  buildStudioBundle,
  runPreflight,
} from './project/index.js';

import { getTextProvider, getImageProvider, getMusicProvider } from './providers/index.js';
import { generateScript, generatePanelImages } from './pipeline/index.js';
import { assembleComic } from './assembler/index.js';
import {
  buildStoryProject,
  renderAgentGuidanceMarkdown,
  buildAgentWorkflowPackage,
  buildProductionRunManifest,
  renderScreenplayMarkdown,
  renderDirectorBriefMarkdown,
  renderSongSheetMarkdown,
  buildStoryboardPackage,
  buildAnimaticTimeline,
  buildVideoPackage,
  buildStudioBundle,
} from './project/index.js';

// Re-export JOB_PROGRESS_STAGES so the jobs runner can look up stage
// labels without duplicating the weight table. The values here are
// the source of truth — keep them in sync with what the WebUI uses.
export { JOB_PROGRESS_STAGES, type JobProgress, type JobProgressStage } from './server/progress-stages.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/**
 * Optional callbacks for the createComic() pipeline. The progress
 * callback is fired at every stage boundary (script / images /
 * assembly / packaging) so callers can surface an ETA without
 * re-deriving it from a wall-clock guess.
 */
export interface CreateComicOptions {
  onProgress?: (stage: 'script' | 'images' | 'assembly' | 'packaging' | 'writing', fraction: number) => void;
}

function toCharacterSubjectReferences(
  refs: readonly string[] | undefined
): Array<{ type: string; image_file: string }> | undefined {
  const cleaned = (refs ?? []).map((ref) => ref.trim()).filter(Boolean);
  if (cleaned.length === 0) return undefined;
  return cleaned.map((ref) => ({ type: 'character', image_file: ref }));
}

/**
 * End-to-end comic generation:
 *   story + options → script → panel images → PDF/CBZ → ComicResult
 */
export async function createComic(
  story: string,
  options: ComicOptions = {},
  hooks: CreateComicOptions = {}
): Promise<ComicResult> {
  const HOME = process.env.HOME ?? '/tmp';
  const opts = {
    artStyle: options.artStyle ?? 'manga',
    imageProvider: options.imageProvider ?? 'mock',
    textProvider: options.textProvider ?? options.imageProvider ?? 'mock',
    musicProvider: options.musicProvider ?? 'mock',
    projectGoal: options.projectGoal ?? 'comic',
    pageCount: options.pageCount ?? 4,
    panelsPerPage: options.panelsPerPage ?? 4,
    outputProfile: options.outputProfile ?? (options.projectGoal === 'screen' ? 'storyboard-widescreen' : 'comic-print'),
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
    characterReferences: options.characterReferences,
    generateCover: options.generateCover ?? true,
    coverImage: options.coverImage,
  } as const;
  const subjectReference = toCharacterSubjectReferences(opts.characterReferences);

  const textProvider = getTextProvider(opts.textProvider);
  const imageProvider = getImageProvider(opts.imageProvider);
  const musicProvider = getMusicProvider(opts.musicProvider);
  const project = buildStoryProject(story, opts);

  hooks.onProgress?.('script', 0);
  const script: ComicScript = await generateScript(
    story,
    {
      pageCount: opts.pageCount,
      panelsPerPage: opts.panelsPerPage,
      artStyle: opts.artStyle,
      projectGoal: opts.projectGoal,
      // Forward the text-model override so the LLM call uses the user's
      // choice. Providers that don't support per-call models ignore it.
      ...(opts.textModel ? { model: opts.textModel } : {}),
    },
    textProvider
  );
  hooks.onProgress?.('script', 1);
  hooks.onProgress?.('images', 0);
  const images = await generatePanelImages(
    script,
    {
      artStyle: opts.artStyle,
      renderProfile: project.renderProfile,
      seed: opts.seed,
      ...(opts.imageModel ? { model: opts.imageModel } : {}),
      ...(opts.imageAspectRatio ? { aspectRatio: opts.imageAspectRatio } : {}),
      ...(opts.imagePromptOptimizer ? { promptOptimizer: true } : {}),
      ...(opts.imageAigcWatermark ? { aigcWatermark: true } : {}),
      ...(subjectReference ? { subjectReference } : {}),
    },
    imageProvider
  );

  // --- Cover image ---
  // Generate a wide cinematic cover using the configured image provider.
  // The cover shows the story's title, art style, and a scene hint.
  // We save it to disk and also pass the Buffer directly to assembleComic
  // so the PDF gets it without a round-trip.
  let coverImagePath: string | null = null;
  let coverImage: Buffer | undefined = opts.coverImage;

  if (!coverImage && opts.generateCover) {
    // Normalize the art style to a single lowercase token so the cover prompt
    // is stable regardless of how the user typed it ("Manga", "manga", "MANGA"
    // all yield "manga"). Empty artStyle falls back to "comic book".
    const artStyle = (opts.artStyle || 'comic book').trim().toLowerCase();
    const coverPrompt = [
      `${artStyle} style.`,
      'A dramatic wide cinematic comic book cover illustration.',
      `Title: "${script.title}"`,
      'Bold typography, vibrant colors, epic composition.',
    ].join(' ');

    const stem = opts.outputPath.replace(/\.[^./\\]+$/, '');
    const coverDir = `${stem}.images`;
    await mkdir(coverDir, { recursive: true });

    try {
      coverImage = await imageProvider.generate(coverPrompt, {
        width: project.renderProfile.cover.width,
        height: project.renderProfile.cover.height,
        ...(opts.imageModel ? { model: opts.imageModel } : {}),
        ...(subjectReference ? { subjectReference } : {}),
      });
      const ext = detectImageFormat(coverImage);
      coverImagePath = join(coverDir, `cover.${ext}`);
      await writeFile(coverImagePath, coverImage);
    } catch (err) {
      console.warn(`[createComic] cover image generation failed: ${(err as Error).message}`);
    }
  }

  hooks.onProgress?.('images', 1);
  hooks.onProgress?.('assembly', 0);
  const outputPath = await assembleComic(script, images, {
    outputPath: opts.outputPath,
    format: opts.outputFormat,
    renderProfile: project.renderProfile,
    coverImage,
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
      await assembleComic(script, images, {
        outputPath: otherPath,
        format: 'cbz',
        renderProfile: project.renderProfile,
      });
      cbzPath = otherPath;
    } catch (err) {
      console.warn(`[createComic] secondary CBZ assembly failed: ${(err as Error).message}`);
    }
  } else {
    cbzPath = outputPath;
    try {
      await assembleComic(script, images, {
        outputPath: otherPath,
        format: 'pdf',
        renderProfile: project.renderProfile,
      });
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
  hooks.onProgress?.('assembly', 1);
  hooks.onProgress?.('packaging', 0);
  const stemFromOutput = outputPath.replace(/\.[^./\\]+$/, '');
  const imageDir = `${stemFromOutput}.images`;
  await mkdir(imageDir, { recursive: true });
  const projectPath = `${stemFromOutput}-project.json`;
  const agentGuidancePath = `${stemFromOutput}-agent-guidance.md`;
  const agentWorkflowPackagePath = `${stemFromOutput}-agent-workflow-package.json`;
  const productionRunManifestPath = `${stemFromOutput}-production-run-manifest.json`;
  const screenplayPath = `${stemFromOutput}-screenplay.md`;
  const directorBriefPath = `${stemFromOutput}-director-brief.md`;
  const songSheetPath = `${stemFromOutput}-song-sheet.md`;
  const songAudioPath = `${stemFromOutput}-theme.${musicProvider.outputExtension}`;
  const musicCuePackagePath = `${stemFromOutput}-music-cue-package.json`;
  const storyboardPackagePath = `${stemFromOutput}-storyboard-package.json`;
  const seriesPackagePath = `${stemFromOutput}-series-package.json`;
  const trailerPackagePath = `${stemFromOutput}-trailer-package.json`;
  const videoPackagePath = `${stemFromOutput}-video-package.json`;
  const animaticTimelinePath = `${stemFromOutput}-animatic-timeline.json`;
  const studioBundlePath = `${stemFromOutput}-studio-bundle.json`;
  const agentPlaybookPath = join(process.cwd(), 'docs', 'agents', 'hermes-openclaw-playbook.md');
  await writeFile(projectPath, JSON.stringify(project, null, 2), 'utf8');
  await writeFile(agentGuidancePath, renderAgentGuidanceMarkdown(project), 'utf8');
  await writeFile(screenplayPath, renderScreenplayMarkdown(project), 'utf8');
  await writeFile(directorBriefPath, renderDirectorBriefMarkdown(project), 'utf8');
  await writeFile(songSheetPath, renderSongSheetMarkdown(project), 'utf8');
  await writeFile(musicCuePackagePath, JSON.stringify(project.musicCuePackage, null, 2), 'utf8');
  await writeFile(seriesPackagePath, JSON.stringify(project.seriesPackage, null, 2), 'utf8');
  await writeFile(songAudioPath, await musicProvider.generate(project, { seed: opts.seed }));
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
  await writeFile(
    storyboardPackagePath,
    JSON.stringify(buildStoryboardPackage({ project, pages: pageImages, songAudioPath }), null, 2),
    'utf8'
  );
  await writeFile(trailerPackagePath, JSON.stringify(project.trailerPackage, null, 2), 'utf8');
  const videoPackage = buildVideoPackage({ project, pages: pageImages, songAudioPath });
  await writeFile(videoPackagePath, JSON.stringify(videoPackage, null, 2), 'utf8');
  await writeFile(
    animaticTimelinePath,
    JSON.stringify(buildAnimaticTimeline({ project, pages: pageImages, songAudioPath }), null, 2),
    'utf8'
  );
  const result: ComicResult = {
    script,
    outputPath,
    pdfPath,
    cbzPath,
    coverImagePath,
    project,
    projectPath,
    storyBible: project.storyBible,
    adaptationPackage: project.adaptationPackage,
    seriesPackage: project.seriesPackage,
    trailerPackage: project.trailerPackage,
    videoPackage,
    musicCuePackage: project.musicCuePackage,
    agentGuidancePackage: project.agentGuidancePackage,
    agentWorkflowPackage: {} as ComicResult['agentWorkflowPackage'],
    productionRunManifest: {} as ComicResult['productionRunManifest'],
    agentGuidancePath,
    agentWorkflowPackagePath,
    productionRunManifestPath,
    screenplayPath,
    directorBriefPath,
    agentPlaybookPath,
    songSheetPath,
    songAudioPath,
    musicCuePackagePath,
    seriesPackagePath,
    musicProvider: musicProvider.name,
    storyboardPackagePath,
    trailerPackagePath,
    videoPackagePath,
    animaticTimelinePath,
    studioBundlePath,
    pages: pageImages,
  };
  result.agentWorkflowPackage = buildAgentWorkflowPackage(project.id, result);
  result.productionRunManifest = buildProductionRunManifest(project.id, result);
  await writeFile(agentWorkflowPackagePath, JSON.stringify(result.agentWorkflowPackage, null, 2), 'utf8');
  await writeFile(productionRunManifestPath, JSON.stringify(result.productionRunManifest, null, 2), 'utf8');
  await writeFile(studioBundlePath, JSON.stringify(buildStudioBundle(project.id, result), null, 2), 'utf8');

  return result;
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
export async function startWebUI(options: StartWebUIOptions = {}): Promise<WebUIHandle> {
  const server = await import('./server/index.js');
  return server.startWebUI(options);
}

export default { createComic, startWebUI };
