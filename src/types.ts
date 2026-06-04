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
  /** Convenience alias for `project.musicCuePackage`. */
  musicCuePackage: MusicCuePackage;
  /** Convenience alias for `project.agentGuidancePackage`. */
  agentGuidancePackage: AgentGuidancePackage;
  /** Absolute path to the generated agent guidance markdown handoff, if written. */
  agentGuidancePath: string | null;
  /** Absolute path to the generated screenplay markdown handoff, if written. */
  screenplayPath: string | null;
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
