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

export interface ComicOptions {
  artStyle?: string;
  /** "openrouter" | "lmstudio" | "minimax" | "mock" | custom name — default "mock" */
  imageProvider?: string;
  /** defaults to the value of imageProvider if not set */
  textProvider?: string;
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
  /** default 'pdf' */
  outputFormat?: 'pdf' | 'cbz';
  /** default: ~/.openclaw/workspace/output/comics/<timestamp>.pdf */
  outputPath?: string;
  /** deterministic seed for the mock provider (default 0) */
  seed?: number;
}

export interface ComicResult {
  script: ComicScript;
  outputPath: string;
  pages: Array<{ page: Page; imagePath: string; layout: Page['layout'] }>;
}
