/**
 * comic-creator — public types contract.
 *
 * This file is the SHARED CONTRACT between every module in the skill.
 * Do not change the shape of these types without coordinating with
 * providers/, pipeline/, and assembler/ — they all build to this.
 */

export interface Panel {
  /** Stable panel id, e.g. "p1-panel1", "p3-panel4". Used as the cache key for the image buffer. */
  id: string;
  /** Visual description used to generate the panel image. */
  description: string;
  /** Optional speech bubbles — one string per bubble, in reading order. */
  dialogue?: string[];
  /** Optional narrator caption (yellow box at the top of the panel). */
  caption?: string;
  /** Optional override for the actual image-gen prompt (defaults to `description`). */
  imagePrompt?: string;
}

export type PageLayout = 'grid-2x2' | 'grid-2x3' | 'strip-3' | 'custom';

export interface Page {
  pageNumber: number;
  panels: Panel[];
  layout: PageLayout;
}

export interface ComicScript {
  title: string;
  artStyle: string;
  pages: Page[];
}

export type OutputProfile = 'comic-print' | 'digital-portrait' | 'storyboard-widescreen';

export type ProjectGoal = 'comic' | 'screen' | 'music' | 'studio';

export interface RenderProfile {
  outputProfile: OutputProfile;
  page: {
    width: number;
    height: number;
    margin: number;
    bleed: number;
  };
  panel: {
    aspectRatio: string;
    targetWidth: number;
    targetHeight: number;
    fit: 'contain' | 'cover';
  };
  cover: {
    width: number;
    height: number;
    aspectRatio: string;
  };
}

export interface StoryBible {
  premise: string;
  synopsis: string;
  chapterOutline: string[];
  sceneBeats: string[];
}

export interface AdaptationPackage {
  format: 'screen-outline';
  sceneOutline: Array<{
    sceneId: string;
    summary: string;
    visualGoal: string;
  }>;
  screenplayScenes: Array<{
    sceneId: string;
    slugline: string;
    action: string;
    dialogueSample: string[];
    shotList: string[];
  }>;
  storyboardPrompts: Array<{
    sceneId: string;
    prompt: string;
    cameraLanguage: string;
  }>;
}

export interface TrailerPackage {
  format: 'trailer-package';
  logline: string;
  hook: string;
  teaserBeats: Array<{
    beatId: string;
    title: string;
    description: string;
    sourceSceneId?: string;
  }>;
  voiceOver: string[];
  cutList: Array<{
    shotId: string;
    shotType: string;
    purpose: string;
    sourceSceneId?: string;
  }>;
  endCard: string;
  durationSeconds: number;
}

export interface MusicCuePackage {
  format: 'music-brief';
  cues: Array<{
    cueId: string;
    title: string;
    mood: string;
    placement: string;
    sceneId?: string;
    instrumentation?: string[];
  }>;
  sceneCueMap: Array<{
    sceneId: string;
    cueId: string;
    timing: string;
    purpose: string;
  }>;
  songDraft: {
    title: string;
    genre: string;
    bpm: number;
    key: string;
    sections: string[];
    lyrics: string;
  };
  themeSongPrompt: string;
  musicGenerationPrompt: string;
}

export interface SeriesPackage {
  format: 'series-bible';
  seriesLogline: string;
  premise: string;
  targetFormat: 'series' | 'limited-series' | 'pilot';
  seasonArc: string[];
  episodeOutline: Array<{
    episodeId: string;
    title: string;
    summary: string;
    cliffhanger: string;
    sourceSceneId?: string;
  }>;
  pilotBeatSheet: string[];
  showrunnerNotes: string[];
}

export interface VideoPackage {
  format: 'video-generation-package';
  provider: 'minimax';
  aspectRatio: string;
  renderGoal: 'show' | 'movie' | 'studio';
  overview: string;
  trailerDirection: string;
  commands: {
    generate: string;
    poll: string;
    download: string;
  };
  clips: Array<{
    clipId: string;
    title: string;
    sourceSceneId?: string;
    durationSeconds: number;
    prompt: string;
    cameraLanguage: string;
    musicCueId?: string;
    musicCueTitle?: string;
    referenceImagePath?: string | null;
  }>;
  workflowNotes: string[];
}

export interface AgentGuidancePackage {
  format: 'agent-guidance';
  frameworks: {
    hermesAgent: {
      repository: string;
      role: string;
    };
    openClaw: {
      repository: string;
      role: string;
    };
  };
  workflowSteps: string[];
  deliverables: string[];
  operatorChecklist: string[];
  externalInterfaces: Array<'cli' | 'mcp' | 'webui' | 'external-agent'>;
  systemPrompt: string;
}

export interface AgentWorkflowPackage {
  format: 'agent-workflow-package';
  jobId: string;
  title: string;
  projectGoal: ProjectGoal;
  frameworks: AgentGuidancePackage['frameworks'];
  entrypoints: Array<{
    label: string;
    path: string | null;
    purpose: string;
  }>;
  tracks: Array<{
    trackId: 'story' | 'video' | 'music';
    title: string;
    objective: string;
    hermesTasks: string[];
    openClawActions: string[];
    artifacts: Array<{
      label: string;
      path: string | null;
    }>;
    verification: string[];
  }>;
  commandBlueprints: {
    cli: string[];
    mcp: string[];
    webui: string[];
    minimax: string[];
  };
}

export interface ProductionRunManifest {
  format: 'production-run-manifest';
  provider: 'minimax';
  jobId: string;
  title: string;
  projectGoal: ProjectGoal;
  entrypoints: {
    studioBundlePath: string | null;
    agentWorkflowPackagePath: string | null;
    videoPackagePath: string | null;
    musicCuePackagePath: string | null;
    animaticTimelinePath: string | null;
    themeAudioPath: string | null;
  };
  gates: Array<{
    gateId: string;
    label: string;
    command: string;
    successSignal: string;
  }>;
  phases: Array<{
    phaseId: 'preflight' | 'music-theme' | 'video-clips' | 'review-package';
    title: string;
    objective: string;
    commands: string[];
    dependsOn: string[];
    outputs: string[];
    verification: string[];
  }>;
  agentInstructions: {
    hermes: string;
    openClaw: string;
    externalAgent: string;
  };
  reviewChecklist: string[];
}

/**
 * Result of actually running a `ProductionRunManifest` against MiniMax.
 * The manifest itself is the recipe; this is the cook's log: which
 * `mmx` calls fired, what came back, where the files landed.
 *
 * Lives in `types.ts` so the runner, the server route, the MCP tool,
 * and the CLI can all share the same shape.
 */
export type ProductionRunStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';
export type ProductionRunPhaseId = 'preflight' | 'music-theme' | 'video-clips' | 'review-package';

export interface ProductionRunStep {
  /** Human-readable label, e.g. "mmx video generate (clip 1 of 3)" */
  label: string;
  /** argv[0] */
  cmd: string;
  /** argv[1..] */
  args: string[];
  /** Child process exit code; null if the call was aborted or never ran. */
  exitCode: number | null;
  /** Captured stdout (truncated to 64 KB to keep reports readable). */
  stdout: string;
  /** Captured stderr (truncated to 64 KB). */
  stderr: string  | null;
  /** Wall-clock duration of the step in milliseconds. */
  durationMs: number;
  /** MiniMax task id returned by `mmx video generate --async`, if any. */
  taskId?: string;
  /** MiniMax file id returned by `mmx video task get` on success, if any. */
  fileId?: string;
  /** Local path of the downloaded/saved artifact, if any. */
  outputPath?: string;
}

export interface ProductionRunPhase {
  phaseId: ProductionRunPhaseId;
  title: string;
  status: ProductionRunStepStatus;
  startedAt?: string;
  completedAt?: string;
  steps: ProductionRunStep[];
  /** Absolute paths to artifacts produced by this phase. */
  outputs: string[];
  error?: string;
}

export interface ProductionRunReport {
  /** Discriminator. Always `'production-run-report'`. Used by the
   *  resume path to recognize on-disk reports from prior runs. */
  format: 'production-run-report';
  /** Wall-clock start of the run. */
  startedAt: string;
  /** Wall-clock end of the run. */
  completedAt: string;
  /** Mirrors the manifest header for easy cross-reference. */
  manifest: {
    jobId: string;
    title: string;
    projectGoal: ProjectGoal;
  };
  /** Directory the runner dropped artifacts into. */
  outputDir: string;
  /** All phases attempted, in manifest order. */
  phases: ProductionRunPhase[];
  /** Flat list of every file path the runner produced. */
  files: string[];
  /** Flat list of every MiniMax task id the runner started. */
  taskIds: string[];
  /** Top-level errors (e.g. abort signal). Phase-level errors live on
   *  `phases[i].error`. */
  errors: string[];
  /** True if this report was produced by `--dry-run` (no real mmx
   *  calls fired). */
  dryRun: boolean;
}

export interface StoryProject {
  id: string;
  title: string;
  premise: string;
  artStyle: string;
  projectGoal: ProjectGoal;
  renderProfile: RenderProfile;
  storyBible: StoryBible;
  adaptationPackage: AdaptationPackage;
  seriesPackage: SeriesPackage;
  trailerPackage: TrailerPackage;
  videoPackage: VideoPackage;
  musicCuePackage: MusicCuePackage;
  agentGuidancePackage: AgentGuidancePackage;
}

export interface ComicOptions {
  artStyle?: string;
  /** "openrouter" | "lmstudio" | "minimax" | "mock" | custom name — default "mock" */
  imageProvider?: string;
  /** defaults to the value of imageProvider if not set */
  textProvider?: string;
  /** "mock" | future music provider names — default "mock" */
  musicProvider?: string;
  /** High-level creative goal for the run. Default: "comic". */
  projectGoal?: ProjectGoal;
  /**
   * Override the image-generation model id for this comic. Falls back to the
   * provider's configured default. Set to "" (empty) to clear.
   * Examples: "black-forest-labs/flux.1-schnell", "dall-e-3", "sdxl", "image-01".
   */
  imageModel?: string;
  /**
   * Override the text-generation model id for this comic. Same rules as
   * `imageModel`. Examples: "openai/gpt-4o-mini", "qwen3.6-35b-a3b",
   * "MiniMax-M3", "claude-3-5-sonnet".
   */
  textModel?: string;
  /**
   * Image aspect ratio like "16:9", "1:1", "4:3". Providers map these to
   * their canonical pixel dimensions. Mutually exclusive with explicit
   * width/height. (Currently honored by the MiniMax provider.)
   */
  imageAspectRatio?: string;
  /**
   * For MiniMax: let the API rewrite the prompt for better results.
   * Equivalent to the CLI's `--prompt-optimizer` flag.
   */
  imagePromptOptimizer?: boolean;
  /**
   * For MiniMax: embed an AI-generated watermark in the output image.
   * Equivalent to the CLI's `--aigc-watermark` flag.
   */
  imageAigcWatermark?: boolean;
  /** default 4 */
  pageCount?: number;
  /** default 4 */
  panelsPerPage?: number;
  /** default 'comic-print' */
  outputProfile?: OutputProfile;
  /** default 'pdf' */
  outputFormat?: 'pdf' | 'cbz';
  /** default: ~/.openclaw/workspace/output/comics/<timestamp>.pdf */
  outputPath?: string;
  /** deterministic seed for the mock provider (default 0) */
  seed?: number;
  /**
   * Provide an externally-generated cover image buffer. The assembler
   * renders it full-bleed on the title page with the title overlaid.
   * If omitted the assembler falls back to a plain text-only title page.
   * When `generateCover` is true this field is populated automatically.
   */
  coverImage?: Buffer;
  /**
   * Automatically generate a wide cinematic cover image for the title
   * page using the configured image provider. Default: true.
   * When true, the resulting `ComicResult.coverImage` path is also saved
   * next to the output file for inspection. Ignored when `coverImage`
   * is already set.
   */
  generateCover?: boolean;
}

export interface ComicResult {
  script: ComicScript;
  /**
   * Path to the file in the user's primary `outputFormat`. Kept for
   * backward compatibility — the canonical fields are now `pdfPath` and
   * `cbzPath`, both of which are always populated so the user can
   * download in either format without re-generating.
   */
  outputPath: string;
  /** Path to the PDF, if the comic was assembled as PDF. */
  pdfPath: string | null;
  /** Path to the CBZ (zip of panel images), if the comic was assembled as CBZ. */
  cbzPath: string | null;
  /** Absolute path to the generated cover/title page image, if any. */
  coverImagePath: string | null;
  /** Reusable structured project artifact backing this comic. */
  project: StoryProject;
  /** Absolute path to the generated full project JSON artifact, if written. */
  projectPath: string | null;
  /** Convenience alias for `project.storyBible`. */
  storyBible: StoryBible;
  /** Convenience alias for `project.adaptationPackage`. */
  adaptationPackage: AdaptationPackage;
  /** Convenience alias for `project.seriesPackage`. */
  seriesPackage: SeriesPackage;
  /** Convenience alias for `project.trailerPackage`. */
  trailerPackage: TrailerPackage;
  /** Convenience alias for the MiniMax-ready video generation package. */
  videoPackage: VideoPackage;
  /** Convenience alias for `project.musicCuePackage`. */
  musicCuePackage: MusicCuePackage;
  /** Convenience alias for `project.agentGuidancePackage`. */
  agentGuidancePackage: AgentGuidancePackage;
  /** Structured Hermes/OpenClaw execution plan for the generated assets. */
  agentWorkflowPackage: AgentWorkflowPackage;
  /** Concrete MiniMax/OpenClaw/Hermes production run order for movie/music generation. */
  productionRunManifest: ProductionRunManifest;
  /** Absolute path to the generated agent guidance markdown handoff, if written. */
  agentGuidancePath: string | null;
  /** Absolute path to the generated agent workflow package JSON, if written. */
  agentWorkflowPackagePath: string | null;
  /** Absolute path to the generated production run manifest JSON, if written. */
  productionRunManifestPath: string | null;
  /** Absolute path to the generated screenplay markdown handoff, if written. */
  screenplayPath: string | null;
  /** Absolute path to the generated director brief markdown handoff, if written. */
  directorBriefPath: string | null;
  /** Absolute path to the repository playbook for Hermes/OpenClaw agents. */
  agentPlaybookPath: string | null;
  /** Absolute path to the generated song sheet markdown handoff, if written. */
  songSheetPath: string | null;
  /** Absolute path to the generated mock theme WAV, if written. */
  songAudioPath: string | null;
  /** Absolute path to the generated music cue package JSON, if written. */
  musicCuePackagePath: string | null;
  /** Music-generation provider used for the song audio artifact. */
  musicProvider: string;
  /** Absolute path to the generated storyboard package JSON, if written. */
  storyboardPackagePath: string | null;
  /** Absolute path to the generated trailer package JSON, if written. */
  trailerPackagePath: string | null;
  /** Absolute path to the generated video package JSON, if written. */
  videoPackagePath: string | null;
  /** Absolute path to the generated series package JSON, if written. */
  seriesPackagePath: string | null;
  /** Absolute path to the generated animatic timeline JSON, if written. */
  animaticTimelinePath: string | null;
  /** Absolute path to the unified studio bundle JSON, if written. */
  studioBundlePath: string | null;
  pages: Array<{
    page: Page;
    /**
     * @deprecated Use `panelImagePaths` instead — `imagePath` only carries
     * the first panel's image and is preserved only for backward
     * compatibility. New code should read `panelImagePaths` and render one
     * image per panel.
     */
    imagePath: string;
    /**
     * Absolute path to every panel image in this page, in reading order.
     * Always contains one entry per panel in the page (so a 3-panel page
     * has 3 entries). The WebUI and downstream consumers can iterate
     * this directly instead of guessing from the script.
     */
    panelImagePaths: string[];
    layout: Page['layout'];
  }>;
}
