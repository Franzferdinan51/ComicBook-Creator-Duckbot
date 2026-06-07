#!/usr/bin/env node
/**
 * comic-creator — CLI entry point.
 *
 * Source-level TypeScript entry. The installed `bin/comic-creator`
 * shim re-invokes node with `tsx/esm` loaded so this file can be
 * executed directly from a published npm install.
 *
 * Usage:
 *   comic-creator [options] <story>
 *
 * Run `comic-creator --help` for the full option list.
 */
import {
  generateScript,
  generatePanelImages,
  assembleComic,
  getTextProvider,
  getImageProvider,
  getMusicProvider,
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
  runPreflight,
  type ComicOptions,
  type ComicResult,
  type ProjectGoal,
  type OutputProfile,
  type PageLayout,
} from './index.js';
import { runProductionManifest } from './project/production-runner.js';
import { validateCharacterReferences } from './project/character-references.js';
import { loadHistory, filterHistory, patchHistoryEntryMeta } from './server/storage.js';
import { getJobManager } from './server/jobs.js';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const PKG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const PLAYBOOK_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'agents',
  'hermes-openclaw-playbook.md'
);

type Layout = 'auto' | 'grid-2x2' | 'grid-2x3' | 'strip-3' | 'custom';
type Format = 'pdf' | 'cbz';

interface ParsedArgs {
  story: string;
  style: string;
  pages: number;
  panels: number;
  layout: Layout;
  format: Format;
  textProvider: string;
  imageProvider: string;
  musicProvider: string;
  projectGoal: ProjectGoal;
  textModel: string | null;
  imageModel: string | null;
  imageAspectRatio: string | null;
  imagePromptOptimizer: boolean;
  imageAigcWatermark: boolean;
  characterReferences: string[];
  generateCover: boolean;
  outputProfile: OutputProfile;
  outputProfileExplicit: boolean;
  output: string | null;
  seed: number;
  json: boolean;
  studioBundle: boolean;
  agentWorkflowPackage: boolean;
  productionRunManifest: boolean;
  screenplay: boolean;
  directorBrief: boolean;
  videoPackage: boolean;
  seriesPackage: boolean;
  trailerPackage: boolean;
  musicCuePackage: boolean;
  help: boolean;
  version: boolean;
  agentPlaybook: boolean;
  preflight: boolean;
  /** Print the public share-card JSON for a single comic. */
  share: boolean;
  /** Search/filter the on-disk history. Mutually exclusive with story
   *  generation — when set, the positional story is ignored. */
  searchHistory: boolean;
  /** When --search-history is set, free-text query against title + tags. */
  searchQuery: string | null;
  /** When --search-history is set, comma-separated tags (AND). */
  searchTags: string[] | null;
  /** When --search-history is set, only starred entries. Set to true
   *  if --search-favorites was passed; null = no filter. */
  searchFavorites: boolean | null;
  /** When --search-history is set, project goal filter. */
  searchProjectGoal: ProjectGoal | null;
  /** Tri-state favorite toggle. null = no flag passed, true = --favorite,
   *  false = --unfavorite. The boolean default of `false` would
   *  conflate "no flag" with "unfavorite" so we use a nullable. */
  favorite: boolean | null;
  /** JobId used with --favorite, --unfavorite, or --tag. */
  jobId: string | null;
  /** Tags to set on a history entry (use with --job-id, comma-separated). */
  tags: string[] | null;
  /** When set, run the production run manifest for a finished comic
   *  against MiniMax. Value is the jobId. Replaces <story>. */
  runProduction: string | null;
  /** When set with --run-production, don't actually invoke mmx — just
   *  plan the command list and write the report. */
  runProductionDryRun: boolean;
  /** When set with --run-production, override the output directory
   *  for the produced music / video / report files. */
  runProductionOutputDir: string | null;
  /** When set with --run-production, resume from a prior in-flight
   *  or errored run by re-using any phase that's already done with
   *  output files still on disk. Preflight always re-runs. */
  runProductionResume: boolean;
}

const USAGE = `comic-creator — generate a multi-page AI comic from a story

Usage:
  comic-creator [options] <story>

Options:
  --style=<name>            Art style (manga, noir, cartoon, watercolor, ...). Default: manga
  --pages=<n>               Number of pages. Default: 4
  --panels=<n>              Panels per page. Default: 4
  --layout=<name>           grid-2x2 | grid-2x3 | strip-3 | custom. Default: auto (uses --panels)
  --format=<pdf|cbz>        Output format. Default: pdf
  --text-provider=<name>    Text-generation provider. Default: mock
  --image-provider=<name>   Image-generation provider. Default: mock
  --music-provider=<name>   Music-generation provider for theme WAV. Default: mock
  --project-goal=<name>     comic | screen | music | studio. Default: comic
  --text-model=<id>         Override the text model id (e.g. openai/gpt-4o-mini, MiniMax-M3). Default: provider's configured default
  --image-model=<id>        Override the image model id (e.g. black-forest-labs/flux.1-schnell, image-01, sdxl). Default: provider's configured default
  --image-aspect-ratio=<r>  Aspect ratio for image gen (e.g. 16:9, 1:1, 4:3). Default: 1:1. Equivalent to the MiniMax CLI's --aspect-ratio.
  --image-prompt-optimizer  Let MiniMax rewrite the prompt before generation. Equivalent to the MiniMax CLI's --prompt-optimizer.
  --image-aigc-watermark    Embed an AI-generated watermark in the output image. Equivalent to the MiniMax CLI's --aigc-watermark.
  --character-reference=<p> Repeatable reference image URL/path for recurring character consistency
  --generate-cover=<bool>   Generate an AI cover image for the title page. Default: true
  --output-profile=<name>   comic-print | digital-portrait | storyboard-widescreen. Default: comic-print
  --output=<path>           Output file path. Default: ~/.openclaw/workspace/output/comics/<title>-<ts>.<format>
  --seed=<n>                Deterministic seed (mock provider). Default: 0
  --json                    Print the full ComicResult JSON and exit
  --studio-bundle           Print the unified studio bundle JSON and exit
  --agent-workflow-package  Print the Hermes/OpenClaw workflow package JSON and exit
  --production-run-manifest Print the MiniMax production run manifest JSON and exit
  --screenplay              Print the generated screenplay markdown and exit
  --director-brief          Print the generated director brief markdown and exit
  --video-package           Print the generated MiniMax-ready video package JSON and exit
  --series-package          Print the episodic series package JSON and exit
  --trailer-package         Print the trailer package JSON and exit
  --music-cue-package       Print the music cue package JSON and exit
  --agent-playbook          Print the repo-level Hermes/OpenClaw playbook and exit
  --preflight               Print production readiness diagnostics JSON and exit
  --share=<jobId>           Print the public share-card JSON for a finished comic and exit
  --search-history          Search/filter the on-disk comic history (replaces <story>)
  --search-q=<text>         Free-text query against title + tags (with --search-history)
  --search-tags=<a,b>       Comma-separated tags, AND-matched (with --search-history)
  --search-favorites        Only starred entries (with --search-history)
  --search-project-goal=<g> comic | screen | music | studio (with --search-history)
  --favorite=<jobId>        Star a comic by jobId and exit
  --unfavorite=<jobId>      Unstar a comic by jobId and exit
  --tag=<jobId>             Set tags on a comic by jobId, then read --tags=<a,b> for the new tags
  --tags=<a,b>              Comma-separated tag list (used with --tag=<jobId>)
  --run-production=<jobId>  Actually run the production run manifest for a finished comic against MiniMax
  --run-production-dry-run  Plan the production run but don't actually invoke mmx (with --run-production)
  --run-production-out=<dir> Override the output directory for production-run artifacts (default: next to PDF)
  --run-production-resume  Resume from a prior run; skip phases already done with outputs on disk (with --run-production)
  --help                    Print this help and exit
  --version                 Print version and exit

Examples:
  comic-creator --style=manga --pages=2 --panels=2 "A robot discovers a garden"
  comic-creator --image-provider=openrouter --image-model=black-forest-labs/flux.1-schnell "A short story"
  comic-creator --image-provider=minimax --image-aspect-ratio=16:9 "A cinematic landscape"
  comic-creator --search-history --search-favorites
  comic-creator --search-history --search-q=acme --search-tags=noir,draft
  comic-creator --favorite=<jobId-from-history>
  comic-creator --tag=<jobId-from-history> --tags=client-acme,noir
`;

function defaultArgs(): ParsedArgs {
  return {
    story: '',
    style: 'manga',
    pages: 4,
    panels: 4,
    layout: 'auto',
    format: 'pdf',
    textProvider: 'mock',
    imageProvider: 'mock',
    musicProvider: 'mock',
    projectGoal: 'comic',
    textModel: null,
    imageModel: null,
    imageAspectRatio: null,
    imagePromptOptimizer: false,
    imageAigcWatermark: false,
    characterReferences: [],
    generateCover: true,
    outputProfile: 'comic-print',
    outputProfileExplicit: false,
    output: null,
    seed: 0,
    json: false,
    studioBundle: false,
    agentWorkflowPackage: false,
    productionRunManifest: false,
    screenplay: false,
    directorBrief: false,
    videoPackage: false,
    seriesPackage: false,
    trailerPackage: false,
    musicCuePackage: false,
    help: false,
    version: false,
    agentPlaybook: false,
    preflight: false,
    share: false,
    searchHistory: false,
    searchQuery: null,
    searchTags: null,
    searchFavorites: null,
    searchProjectGoal: null,
    favorite: null,
    jobId: null,
    tags: null,
    runProduction: null,
    runProductionDryRun: false,
    runProductionOutputDir: null,
    runProductionResume: false,
  };
}

function applyFlag(args: ParsedArgs, key: string, value: string): void {
  switch (key) {
    case 'style':
      args.style = value;
      break;
    case 'pages': {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n) || n < 1) throw new Error(`--pages must be a positive integer, got "${value}"`);
      args.pages = n;
      break;
    }
    case 'panels': {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n) || n < 1) throw new Error(`--panels must be a positive integer, got "${value}"`);
      args.panels = n;
      break;
    }
    case 'layout':
      if (!['auto', 'grid-2x2', 'grid-2x3', 'strip-3', 'custom'].includes(value)) {
        throw new Error(`--layout must be one of auto|grid-2x2|grid-2x3|strip-3|custom, got "${value}"`);
      }
      args.layout = value as Layout;
      break;
    case 'format':
      if (value !== 'pdf' && value !== 'cbz') {
        throw new Error(`--format must be pdf or cbz, got "${value}"`);
      }
      args.format = value;
      break;
    case 'text-provider':
      args.textProvider = value;
      break;
    case 'image-provider':
      args.imageProvider = value;
      break;
    case 'music-provider':
      args.musicProvider = value;
      break;
    case 'project-goal':
      if (value !== 'comic' && value !== 'screen' && value !== 'music' && value !== 'studio') {
        throw new Error(`--project-goal must be one of comic|screen|music|studio, got "${value}"`);
      }
      args.projectGoal = value;
      break;
    case 'text-model':
      args.textModel = value;
      break;
    case 'image-model':
      args.imageModel = value;
      break;
    case 'image-aspect-ratio': {
      const valid = ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9', '2:3', '3:2', '5:4', '4:5'];
      if (!valid.includes(value)) {
        throw new Error(`--image-aspect-ratio must be one of ${valid.join('|')}, got "${value}"`);
      }
      args.imageAspectRatio = value;
      break;
    }
    case 'image-prompt-optimizer':
      args.imagePromptOptimizer = true;
      break;
    case 'image-aigc-watermark':
      args.imageAigcWatermark = true;
      break;
    case 'character-reference':
      args.characterReferences.push(value);
      break;
    case 'generate-cover':
      if (value === 'true' || value === '1' || value === 'yes') {
        args.generateCover = true;
      } else if (value === 'false' || value === '0' || value === 'no') {
        args.generateCover = false;
      } else {
        throw new Error(`--generate-cover must be true|false, got "${value}"`);
      }
      break;
    case 'share':
      args.share = true;
      args.jobId = value;
      break;
    case 'search-q':
      args.searchQuery = value;
      break;
    case 'search-tags':
      args.searchTags = value
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      break;
    case 'search-project-goal':
      if (value !== 'comic' && value !== 'screen' && value !== 'music' && value !== 'studio') {
        throw new Error(`--search-project-goal must be one of comic|screen|music|studio, got "${value}"`);
      }
      args.searchProjectGoal = value;
      break;
    case 'favorite':
      args.favorite = true;
      args.jobId = value;
      break;
    case 'unfavorite':
      args.favorite = false;
      args.jobId = value;
      break;
    case 'tag':
      args.jobId = value;
      break;
    case 'tags':
      args.tags = value
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      break;
    case 'run-production':
      args.runProduction = value;
      break;
    case 'run-production-dry-run':
      args.runProductionDryRun = true;
      break;
    case 'run-production-out':
      args.runProductionOutputDir = value;
      break;
    case 'output-profile':
      if (value !== 'comic-print' && value !== 'digital-portrait' && value !== 'storyboard-widescreen') {
        throw new Error(`--output-profile must be one of comic-print|digital-portrait|storyboard-widescreen, got "${value}"`);
      }
      args.outputProfile = value;
      args.outputProfileExplicit = true;
      break;
    case 'output':
      args.output = value;
      break;
    case 'seed': {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n)) throw new Error(`--seed must be an integer, got "${value}"`);
      args.seed = n;
      break;
    }
    default:
      throw new Error(`Unknown flag: --${key}`);
  }
}

/**
 * Minimal arg parser: --key=value flags, then positional <story>.
 * Recognises --help / --version / --json / --studio-bundle / --agent-workflow-package / --production-run-manifest / --screenplay / --director-brief / --video-package / --series-package / --trailer-package / --music-cue-package / --agent-playbook / --preflight (and -h / -V).
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const args = defaultArgs();
  const positionals: string[] = [];

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--version' || arg === '-V') {
      args.version = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--studio-bundle') {
      args.studioBundle = true;
    } else if (arg === '--agent-workflow-package') {
      args.agentWorkflowPackage = true;
    } else if (arg === '--production-run-manifest') {
      args.productionRunManifest = true;
    } else if (arg === '--screenplay') {
      args.screenplay = true;
    } else if (arg === '--director-brief') {
      args.directorBrief = true;
    } else if (arg === '--video-package') {
      args.videoPackage = true;
    } else if (arg === '--series-package') {
      args.seriesPackage = true;
    } else if (arg === '--trailer-package') {
      args.trailerPackage = true;
    } else if (arg === '--music-cue-package') {
      args.musicCuePackage = true;
    } else if (arg === '--agent-playbook') {
      args.agentPlaybook = true;
    } else if (arg === '--preflight') {
      args.preflight = true;
    } else if (arg === '--search-history') {
      args.searchHistory = true;
    } else if (arg === '--search-favorites') {
      args.searchFavorites = true;
    } else if (arg === '--run-production-dry-run') {
      args.runProductionDryRun = true;
    } else if (arg === '--run-production-resume') {
      args.runProductionResume = true;
    } else if (arg.startsWith('--') && arg.includes('=')) {
      const eq = arg.indexOf('=');
      const key = arg.slice(2, eq);
      const value = arg.slice(eq + 1);
      applyFlag(args, key, value);
    } else if (arg.startsWith('--')) {
      throw new Error(`Flag ${arg} requires a value (use --${arg.slice(2)}=<value>)`);
    } else {
      positionals.push(arg);
    }
  }

  args.story = positionals.join(' ').trim();
  // Validate the accumulated character references now that the
  // parser has seen every flag. This used to happen (incompletely)
  // inside the case handler, which accepted an empty-after-trim
  // value as a fatal error rather than a clean dedupe. The shared
  // helper is the same one the HTTP route + MCP tool use, so a
  // bad reference is rejected with the same error message in all
  // three control surfaces.
  if (args.characterReferences.length > 0) {
    const refs = validateCharacterReferences(args.characterReferences);
    if (!refs.ok) {
      throw new Error(`--character-reference: ${refs.error}`);
    }
    args.characterReferences = refs.value;
  }
  return args;
}

export function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'comic';
}

export function defaultOutputPath(story: string, format: Format): string {
  const home = process.env.HOME ?? '/tmp';
  return `${home}/.openclaw/workspace/output/comics/${slugify(story)}-${Date.now()}.${format}`;
}

export async function getVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(PKG_PATH, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function getAgentPlaybookMarkdown(): Promise<string> {
  return await readFile(PLAYBOOK_PATH, 'utf8');
}

/**
 * Map a CLI --layout value to a panelsPerPage count.
 * "auto" preserves the user's --panels value; explicit layout names
 * win over --panels.
 */
export function layoutToPanels(layout: Layout, panels: number): number {
  switch (layout) {
    case 'grid-2x2':
      return 4;
    case 'grid-2x3':
      return 6;
    case 'strip-3':
      return 3;
    case 'custom':
    case 'auto':
    default:
      return panels;
  }
}

/**
 * Run the full pipeline with per-step progress logging to stderr.
 * Output path is returned via the Promise; final summary line goes to
 * stderr so stdout stays a single line (the output path) for piping.
 */
export async function runCli(
  args: ParsedArgs,
  log: (msg: string) => void = (m) => process.stderr.write(m + '\n')
): Promise<ComicResult> {
  const panelsPerPage = layoutToPanels(args.layout, args.panels);
  const outputPath = args.output ?? defaultOutputPath(args.story, args.format);
  const project = buildStoryProject(args.story, {
    artStyle: args.style,
    pageCount: args.pages,
    panelsPerPage,
    ...(args.outputProfileExplicit ? { outputProfile: args.outputProfile } : {}),
    projectGoal: args.projectGoal,
  });

  const opts: ComicOptions = {
    artStyle: args.style,
    imageProvider: args.imageProvider,
    musicProvider: args.musicProvider,
    projectGoal: args.projectGoal,
    textProvider: args.textProvider,
    pageCount: args.pages,
    panelsPerPage,
    outputProfile: args.outputProfile,
    outputFormat: args.format,
    outputPath,
    seed: args.seed,
    ...(args.textModel ? { textModel: args.textModel } : {}),
    ...(args.imageModel ? { imageModel: args.imageModel } : {}),
    ...(args.imageAspectRatio ? { imageAspectRatio: args.imageAspectRatio } : {}),
    ...(args.imagePromptOptimizer ? { imagePromptOptimizer: true } : {}),
    ...(args.imageAigcWatermark ? { imageAigcWatermark: true } : {}),
    ...(args.characterReferences.length > 0 ? { characterReferences: [...args.characterReferences] } : {}),
    // Forward both true and false — explicit false is meaningful (skip cover).
    generateCover: args.generateCover,
  };

  log(`comic-creator: ${args.pages} page(s) × ${panelsPerPage} panel(s) in "${args.style}" style`);
  log(
    `comic-creator: text=${args.textProvider}${args.textModel ? ` (${args.textModel})` : ''} ` +
    `image=${args.imageProvider}${args.imageModel ? ` (${args.imageModel})` : ''} ` +
    `music=${args.musicProvider} ` +
    `goal=${args.projectGoal} ` +
    (args.imageAspectRatio ? `aspect=${args.imageAspectRatio} ` : '') +
    `format=${args.format} seed=${args.seed}`
  );

  const textProvider = getTextProvider(args.textProvider);
  const imageProvider = getImageProvider(args.imageProvider);
  const musicProvider = getMusicProvider(args.musicProvider);

  log('comic-creator: [1/3] generating script...');
  const script = await generateScript(
    args.story,
    {
      pageCount: opts.pageCount,
      panelsPerPage: opts.panelsPerPage,
      artStyle: opts.artStyle,
      projectGoal: args.projectGoal,
    },
    textProvider
  );
  log(
    `comic-creator:         script ready (title="${script.title}", ${script.pages.length} pages)`
  );

  log('comic-creator: [2/3] generating panel images...');
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
      ...(opts.characterReferences?.length
        ? {
            subjectReference: opts.characterReferences.map((ref) => ({
              type: 'character',
              image_file: ref,
            })),
          }
        : {}),
    },
    imageProvider
  );
  log(`comic-creator:         ${images.size} panel image(s) ready`);

  log('comic-creator: [3/3] assembling comic...');
  const finalPath = await assembleComic(script, images, {
    outputPath,
    format: args.format,
    renderProfile: project.renderProfile,
  });
  log(`comic-creator:         wrote ${finalPath}`);

  // Save per-panel images next to the PDF for inspection (mirrors the
  // createComic() side effect). We do this here, not by re-running the
  // whole pipeline through createComic() — that would double the cost on
  // real image providers.
  const imageDir = `${finalPath.replace(/\.[^./\\]+$/, '')}.images`;
  await mkdir(imageDir, { recursive: true });
  const projectPath = `${finalPath.replace(/\.[^./\\]+$/, '')}-project.json`;
  const agentGuidancePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-agent-guidance.md`;
  const agentWorkflowPackagePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-agent-workflow-package.json`;
  const productionRunManifestPath = `${finalPath.replace(/\.[^./\\]+$/, '')}-production-run-manifest.json`;
  const screenplayPath = `${finalPath.replace(/\.[^./\\]+$/, '')}-screenplay.md`;
  const directorBriefPath = `${finalPath.replace(/\.[^./\\]+$/, '')}-director-brief.md`;
  const songSheetPath = `${finalPath.replace(/\.[^./\\]+$/, '')}-song-sheet.md`;
  const songAudioPath = `${finalPath.replace(/\.[^./\\]+$/, '')}-theme.${musicProvider.outputExtension}`;
  const musicCuePackagePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-music-cue-package.json`;
  const storyboardPackagePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-storyboard-package.json`;
  const seriesPackagePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-series-package.json`;
  const trailerPackagePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-trailer-package.json`;
  const videoPackagePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-video-package.json`;
  const animaticTimelinePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-animatic-timeline.json`;
  const studioBundlePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-studio-bundle.json`;
  await writeFile(projectPath, JSON.stringify(project, null, 2), 'utf8');
  await writeFile(agentGuidancePath, renderAgentGuidanceMarkdown(project), 'utf8');
  await writeFile(screenplayPath, renderScreenplayMarkdown(project), 'utf8');
  await writeFile(directorBriefPath, renderDirectorBriefMarkdown(project), 'utf8');
  await writeFile(songSheetPath, renderSongSheetMarkdown(project), 'utf8');
  await writeFile(musicCuePackagePath, JSON.stringify(project.musicCuePackage, null, 2), 'utf8');
  await writeFile(seriesPackagePath, JSON.stringify(project.seriesPackage, null, 2), 'utf8');
  await writeFile(songAudioPath, await musicProvider.generate(project, { seed: args.seed }));
  const pages: Array<{
    page: typeof script.pages[number];
    imagePath: string;
    panelImagePaths: string[];
    layout: PageLayout;
  }> = [];
  for (const page of script.pages) {
    const panelImagePaths: string[] = [];
    for (const panel of page.panels) {
      const buf = images.get(panel.id);
      if (!buf) continue;
      const isJpg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      const ext = isJpg ? 'jpg' : 'png';
      const p = join(imageDir, `${panel.id}.${ext}`);
      await writeFile(p, buf);
      panelImagePaths.push(p);
    }
    pages.push({
      page,
      imagePath: panelImagePaths[0] ?? '',
      panelImagePaths,
      layout: page.layout as PageLayout,
    });
  }
  await writeFile(
    storyboardPackagePath,
    JSON.stringify(buildStoryboardPackage({ project, pages, songAudioPath }), null, 2),
    'utf8'
  );
  await writeFile(trailerPackagePath, JSON.stringify(project.trailerPackage, null, 2), 'utf8');
  const videoPackage = buildVideoPackage({
    project,
    pages,
    songAudioPath,
    characterReferences: opts.characterReferences,
  });
  await writeFile(videoPackagePath, JSON.stringify(videoPackage, null, 2), 'utf8');
  await writeFile(
    animaticTimelinePath,
    JSON.stringify(buildAnimaticTimeline({ project, pages, songAudioPath }), null, 2),
    'utf8'
  );

  // Pre-render the OTHER format too so the user can convert without
  // re-running the pipeline. Matches the behavior of createComic() so
  // the CLI and library outputs are consistent.
  const otherFormat: 'pdf' | 'cbz' = args.format === 'pdf' ? 'cbz' : 'pdf';
  const otherPath = finalPath.replace(/\.[^./\\]+$/, '') + '.' + otherFormat;
  let pdfPath: string | null = null;
  let cbzPath: string | null = null;
  if (args.format === 'pdf') {
    pdfPath = finalPath;
    try {
      await assembleComic(script, images, { outputPath: otherPath, format: 'cbz' });
      cbzPath = otherPath;
    } catch (err) {
      log(`comic-creator:         secondary CBZ assembly failed: ${(err as Error).message}`);
    }
  } else {
    cbzPath = finalPath;
    try {
      await assembleComic(script, images, { outputPath: otherPath, format: 'pdf' });
      pdfPath = otherPath;
    } catch (err) {
      log(`comic-creator:         secondary PDF assembly failed: ${(err as Error).message}`);
    }
  }

  const result: ComicResult = {
    script,
    outputPath: finalPath,
    pdfPath,
    cbzPath,
    coverImagePath: null,
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
    agentPlaybookPath: PLAYBOOK_PATH,
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
    pages,
  };
  result.agentWorkflowPackage = buildAgentWorkflowPackage(project.id, result);
  result.productionRunManifest = buildProductionRunManifest(project.id, result);
  await writeFile(agentWorkflowPackagePath, JSON.stringify(result.agentWorkflowPackage, null, 2), 'utf8');
  await writeFile(productionRunManifestPath, JSON.stringify(result.productionRunManifest, null, 2), 'utf8');
  await writeFile(studioBundlePath, JSON.stringify(buildStudioBundle(project.id, result), null, 2), 'utf8');
  return result;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`comic-creator: ${err instanceof Error ? err.message : String(err)}\n`);
    process.stderr.write('Run `comic-creator --help` for usage.\n');
    process.exit(2);
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (args.version) {
    const v = await getVersion();
    process.stdout.write(`${v}\n`);
    return;
  }
  if (args.agentPlaybook) {
    process.stdout.write(await getAgentPlaybookMarkdown());
    return;
  }
  if (args.preflight) {
    process.stdout.write(JSON.stringify(await runPreflight(), null, 2) + '\n');
    return;
  }
  if (args.share) {
    if (!args.jobId) {
      process.stderr.write('comic-creator: --share=<jobId> requires a jobId\n');
      process.exit(2);
    }
    const resolved = await getJobManager().resolve(args.jobId);
    if (!resolved) {
      process.stderr.write(`comic-creator: job ${args.jobId} not found\n`);
      process.exit(1);
    }
    if (resolved.status !== 'done' || !resolved.result) {
      process.stderr.write(`comic-creator: job ${args.jobId} not done (status: ${resolved.status})\n`);
      process.exit(1);
    }
    const r = resolved.result;
    const panelCount = (r.script?.pages || []).reduce(
      (acc, p) => acc + (p.panels?.length || 0), 0
    );
    process.stdout.write(JSON.stringify({
      format: 'share-card',
      jobId: r.project?.id || args.jobId,
      title: r.script?.title || 'Untitled',
      artStyle: r.script?.artStyle || '—',
      projectGoal: r.project?.projectGoal || 'comic',
      outputProfile: r.project?.renderProfile?.outputProfile || 'comic-print',
      pageCount: r.script?.pages?.length || 0,
      panelCount,
      preview: {
        cover: r.coverImagePath ? `/api/comic/${args.jobId}/cover` : null,
        pdf: r.pdfPath ? `/api/comic/${args.jobId}/pdf` : null,
        cbz: r.cbzPath ? `/api/comic/${args.jobId}/cbz` : null,
      },
      artifacts: {
        studioBundle: r.studioBundlePath ? `/api/comic/${args.jobId}/studio-bundle` : null,
        project: r.projectPath ? `/api/comic/${args.jobId}/project` : null,
        screenplay: r.screenplayPath ? `/api/comic/${args.jobId}/screenplay` : null,
        directorBrief: r.directorBriefPath ? `/api/comic/${args.jobId}/director-brief` : null,
        storyboardPackage: r.storyboardPackagePath ? `/api/comic/${args.jobId}/storyboard-package` : null,
        videoPackage: r.videoPackagePath ? `/api/comic/${args.jobId}/video-package` : null,
        trailerPackage: r.trailerPackagePath ? `/api/comic/${args.jobId}/trailer-package` : null,
        seriesPackage: r.seriesPackagePath ? `/api/comic/${args.jobId}/series-package` : null,
        musicCuePackage: r.musicCuePackagePath ? `/api/comic/${args.jobId}/music-cue-package` : null,
        songSheet: r.songSheetPath ? `/api/comic/${args.jobId}/song-sheet` : null,
        themeAudio: r.songAudioPath ? `/api/comic/${args.jobId}/theme-audio` : null,
        agentGuidance: r.agentGuidancePath ? `/api/comic/${args.jobId}/agent-guidance` : null,
        agentWorkflowPackage: r.agentWorkflowPackagePath
          ? `/api/comic/${args.jobId}/agent-workflow-package`
          : null,
        productionRunManifest: r.productionRunManifestPath
          ? `/api/comic/${args.jobId}/production-run-manifest`
          : null,
      },
      storyBible: {
        premise: r.storyBible?.premise || '',
        synopsis: r.storyBible?.synopsis || '',
        chapterCount: r.storyBible?.chapterOutline?.length || 0,
      },
    }, null, 2) + '\n');
    return;
  }
  if (args.searchHistory) {
    const list = await loadHistory();
    const filtered = filterHistory(list, {
      q: args.searchQuery ?? undefined,
      projectGoal: args.searchProjectGoal ?? undefined,
      favorite: args.searchFavorites === true ? true : undefined,
      tags: args.searchTags ?? undefined,
      limit: 50,
    });
    process.stdout.write(JSON.stringify(filtered, null, 2) + '\n');
    return;
  }
  // --favorite=<jobId>  /  --unfavorite=<jobId>  → toggle the favorite bit.
  // The tri-state `favorite` field lets us distinguish "user passed the
  // flag" (true / false) from "user didn't pass the flag" (null).
  if (args.favorite !== null && args.tags === null) {
    const next = await patchHistoryEntryMeta(args.jobId!, { favorite: args.favorite });
    if (!next) {
      process.stderr.write(`comic-creator: history entry ${args.jobId} not found\n`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(next, null, 2) + '\n');
    return;
  }
  if (args.jobId && args.tags !== null) {
    // --tag=<jobId> --tags=foo,bar → set tags on the entry
    const next = await patchHistoryEntryMeta(args.jobId, { tags: args.tags });
    if (!next) {
      process.stderr.write(`comic-creator: history entry ${args.jobId} not found\n`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(next, null, 2) + '\n');
    return;
  }
  if (args.runProduction) {
    // --run-production=<jobId> [--run-production-dry-run] [--run-production-out=<dir>]
    // Resolve the comic, build the manifest, then run it.
    const jobId = args.runProduction;
    const resolved = await getJobManager().resolve(jobId);
    if (!resolved) {
      process.stderr.write(`comic-creator: job ${jobId} not found\n`);
      process.exit(1);
    }
    if (resolved.status !== 'done' || !resolved.result) {
      process.stderr.write(`comic-creator: job ${jobId} not done (status: ${resolved.status})\n`);
      process.exit(1);
    }
    const r = resolved.result;
    if (!r.musicCuePackage || !r.videoPackage) {
      process.stderr.write(`comic-creator: job ${jobId} has no music/video package (re-run with --project-goal=studio or screen)\n`);
      process.exit(1);
    }
    const manifest = r.productionRunManifest ?? buildProductionRunManifest(jobId, r);
    const outDir = args.runProductionOutputDir
      ? resolve(args.runProductionOutputDir)
      : r.outputPath
        ? dirname(r.outputPath)
        : process.cwd();
    const controller = new AbortController();
    process.on('SIGINT', () => controller.abort());
    process.on('SIGTERM', () => controller.abort());
    process.stderr.write(
      args.runProductionDryRun
        ? `comic-creator: planning production run for ${jobId} → ${outDir}\n`
        : `comic-creator: running production for ${jobId} → ${outDir}\n`
    );
    const report = await runProductionManifest(manifest, r, {
      outputDir: outDir,
      dryRun: args.runProductionDryRun,
      resume: args.runProductionResume,
      signal: controller.signal,
    });
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    const anyPhaseError = report.phases.some((p) => p.status === 'error');
    process.exit(anyPhaseError ? 1 : 0);
  }
  if (!args.story) {
    process.stderr.write('comic-creator: missing <story> argument. Run `comic-creator --help`.\n');
    process.exit(2);
  }

  try {
    const result = await runCli(args);
    if (args.studioBundle) {
      process.stdout.write(await readFile(result.studioBundlePath!, 'utf8'));
      return;
    }
    if (args.agentWorkflowPackage) {
      process.stdout.write(await readFile(result.agentWorkflowPackagePath!, 'utf8'));
      return;
    }
    if (args.productionRunManifest) {
      process.stdout.write(await readFile(result.productionRunManifestPath!, 'utf8'));
      return;
    }
    if (args.screenplay) {
      process.stdout.write(await readFile(result.screenplayPath!, 'utf8'));
      return;
    }
    if (args.directorBrief) {
      process.stdout.write(await readFile(result.directorBriefPath!, 'utf8'));
      return;
    }
    if (args.videoPackage) {
      process.stdout.write(await readFile(result.videoPackagePath!, 'utf8'));
      return;
    }
    if (args.seriesPackage) {
      process.stdout.write(await readFile(result.seriesPackagePath!, 'utf8'));
      return;
    }
    if (args.trailerPackage) {
      process.stdout.write(await readFile(result.trailerPackagePath!, 'utf8'));
      return;
    }
    if (args.musicCuePackage) {
      process.stdout.write(await readFile(result.musicCuePackagePath!, 'utf8'));
      return;
    }
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      process.stdout.write(result.outputPath + '\n');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    process.stderr.write(`comic-creator: error — ${msg}\n`);
    process.exit(1);
  }
}

// Only run main() when invoked directly, not when imported for tests.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  void main();
}
