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
  renderSongSheetMarkdown,
  buildStoryboardPackage,
  buildAnimaticTimeline,
  buildStudioBundle,
  type ComicOptions,
  type ComicResult,
  type ProjectGoal,
  type OutputProfile,
  type PageLayout,
} from './index.js';
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
  outputProfile: OutputProfile;
  outputProfileExplicit: boolean;
  output: string | null;
  seed: number;
  json: boolean;
  studioBundle: boolean;
  seriesPackage: boolean;
  trailerPackage: boolean;
  musicCuePackage: boolean;
  help: boolean;
  version: boolean;
  agentPlaybook: boolean;
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
  --output-profile=<name>   comic-print | digital-portrait | storyboard-widescreen. Default: comic-print
  --output=<path>           Output file path. Default: ~/.openclaw/workspace/output/comics/<title>-<ts>.<format>
  --seed=<n>                Deterministic seed (mock provider). Default: 0
  --json                    Print the full ComicResult JSON and exit
  --studio-bundle           Print the unified studio bundle JSON and exit
  --series-package          Print the episodic series package JSON and exit
  --trailer-package         Print the trailer package JSON and exit
  --music-cue-package       Print the music cue package JSON and exit
  --agent-playbook          Print the repo-level Hermes/OpenClaw playbook and exit
  --help                    Print this help and exit
  --version                 Print version and exit

Examples:
  comic-creator --style=manga --pages=2 --panels=2 "A robot discovers a garden"
  comic-creator --image-provider=openrouter --image-model=black-forest-labs/flux.1-schnell "A short story"
  comic-creator --image-provider=minimax --image-aspect-ratio=16:9 "A cinematic landscape"
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
    outputProfile: 'comic-print',
    outputProfileExplicit: false,
    output: null,
    seed: 0,
    json: false,
    studioBundle: false,
    seriesPackage: false,
    trailerPackage: false,
    musicCuePackage: false,
    help: false,
    version: false,
    agentPlaybook: false,
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
 * Recognises --help / --version / --json / --studio-bundle / --series-package / --trailer-package / --music-cue-package / --agent-playbook (and -h / -V).
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
    } else if (arg === '--series-package') {
      args.seriesPackage = true;
    } else if (arg === '--trailer-package') {
      args.trailerPackage = true;
    } else if (arg === '--music-cue-package') {
      args.musicCuePackage = true;
    } else if (arg === '--agent-playbook') {
      args.agentPlaybook = true;
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
  const songSheetPath = `${finalPath.replace(/\.[^./\\]+$/, '')}-song-sheet.md`;
  const songAudioPath = `${finalPath.replace(/\.[^./\\]+$/, '')}-theme.${musicProvider.outputExtension}`;
  const musicCuePackagePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-music-cue-package.json`;
  const storyboardPackagePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-storyboard-package.json`;
  const seriesPackagePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-series-package.json`;
  const trailerPackagePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-trailer-package.json`;
  const animaticTimelinePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-animatic-timeline.json`;
  const studioBundlePath = `${finalPath.replace(/\.[^./\\]+$/, '')}-studio-bundle.json`;
  await writeFile(projectPath, JSON.stringify(project, null, 2), 'utf8');
  await writeFile(agentGuidancePath, renderAgentGuidanceMarkdown(project), 'utf8');
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
    musicCuePackage: project.musicCuePackage,
    agentGuidancePackage: project.agentGuidancePackage,
    agentGuidancePath,
    agentPlaybookPath: PLAYBOOK_PATH,
    songSheetPath,
    songAudioPath,
    musicCuePackagePath,
    seriesPackagePath,
    musicProvider: musicProvider.name,
    storyboardPackagePath,
    trailerPackagePath,
    animaticTimelinePath,
    studioBundlePath,
    pages,
  };
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
