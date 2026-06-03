/**
 * comic-creator — providers registry.
 *
 * Re-exports every adapter, the two provider interfaces, the config helpers,
 * and exposes `getTextProvider(name)` / `getImageProvider(name)` for the
 * rest of the skill to consume.
 *
 * Provider names (case-sensitive, used in `ComicOptions.imageProvider` /
 * `ComicOptions.textProvider`):
 *   - "mock"       — deterministic, no network
 *   - "openrouter" — OpenRouter API (text + image)
 *   - "lmstudio"   — local LM Studio at 127.0.0.1:1234 (text + image)
 *   - "minimax"    — MiniMax API (text + image, anthropic-compat or native)
 *   - "xai"        — xAI / Grok (text + Grok Imagine image)
 *   - "gemini"     — Google Gemini (text via OpenAI-compat shim, image via native)
 *   - "comfyui"    — local ComfyUI with `--enable-openai-api` (text + image)
 *   - "<custom>"   — any user-defined OpenAI-compatible endpoint, added
 *                     through the WebUI Settings page
 */

export * from './text.js';
export * from './image.js';
export * from './music.js';
export * from './custom.js';
export * from './xai.js';
export * from './gemini.js';
export * from './comfyui.js';
export * from './config.js';

import {
  OpenRouterText,
  LMStudioText,
  MiniMaxText,
  MockText,
  type TextProvider,
} from './text.js';
import {
  OpenRouterImage,
  LMStudioImage,
  MiniMaxImage,
  MockImage,
  type ImageProvider,
} from './image.js';
import {
  MockMusic,
  MiniMaxMusic,
  type MusicProvider,
} from './music.js';
import {
  XAIText,
  XAIImage,
} from './xai.js';
import {
  GeminiText,
  GeminiImage,
} from './gemini.js';
import {
  ComfyUIText,
  ComfyUIImage,
} from './comfyui.js';
import {
  CustomOpenAIText,
  CustomOpenAIImage,
  type CustomProviderConfig,
} from './custom.js';

/** Built-in text providers — always registered. */
const builtInTextProviders: Record<string, TextProvider> = {
  openrouter: new OpenRouterText(),
  lmstudio: new LMStudioText(),
  minimax: new MiniMaxText(),
  xai: new XAIText(),
  gemini: new GeminiText(),
  comfyui: new ComfyUIText(),
  mock: new MockText(),
};

/** Built-in image providers — always registered. */
const builtInImageProviders: Record<string, ImageProvider> = {
  openrouter: new OpenRouterImage(),
  lmstudio: new LMStudioImage(),
  minimax: new MiniMaxImage(),
  xai: new XAIImage(),
  gemini: new GeminiImage(),
  comfyui: new ComfyUIImage(),
  mock: new MockImage(),
};

/** Built-in music providers — always registered. */
const builtInMusicProviders: Record<string, MusicProvider> = {
  mock: new MockMusic(),
  minimax: new MiniMaxMusic(),
};

/** User-defined custom providers, keyed by name. Rebuilt by
 *  `setCustomProviderRegistry()` whenever the user adds/removes one. */
let _customTextProviders: Record<string, TextProvider> = {};
let _customImageProviders: Record<string, ImageProvider> = {};

/** Look up a text provider by name. Throws if the name is unknown. */
export function getTextProvider(name: string): TextProvider {
  const p = builtInTextProviders[name] ?? _customTextProviders[name];
  if (!p) {
    throw new Error(
      `Unknown text provider: ${name}. Available: ${allTextProviderNames().join(', ')}`
    );
  }
  return p;
}

/** Look up an image provider by name. Throws if the name is unknown. */
export function getImageProvider(name: string): ImageProvider {
  const p = builtInImageProviders[name] ?? _customImageProviders[name];
  if (!p) {
    throw new Error(
      `Unknown image provider: ${name}. Available: ${allImageProviderNames().join(', ')}`
    );
  }
  return p;
}

/** Look up a music provider by name. Throws if the name is unknown. */
export function getMusicProvider(name: string): MusicProvider {
  const p = builtInMusicProviders[name];
  if (!p) {
    throw new Error(
      `Unknown music provider: ${name}. Available: ${allMusicProviderNames().join(', ')}`
    );
  }
  return p;
}

/** Built-in text provider names. */
export function listTextProviders(): string[] {
  return Object.keys(builtInTextProviders);
}

/** Built-in image provider names. */
export function listImageProviders(): string[] {
  return Object.keys(builtInImageProviders);
}

/** Built-in music provider names. */
export function listMusicProviders(): string[] {
  return Object.keys(builtInMusicProviders);
}

/** Built-in + custom text provider names. */
export function allTextProviderNames(): string[] {
  return [...Object.keys(builtInTextProviders), ...Object.keys(_customTextProviders)];
}

/** Built-in + custom image provider names. */
export function allImageProviderNames(): string[] {
  return [...Object.keys(builtInImageProviders), ...Object.keys(_customImageProviders)];
}

/** Built-in music provider names. */
export function allMusicProviderNames(): string[] {
  return Object.keys(builtInMusicProviders);
}

/**
 * Replace the entire custom-provider registry. Called by the server's routes
 * after the user adds, updates, or removes a custom provider. Each entry
 * registers as BOTH a text and an image provider (OpenAI-compatible APIs
 * serve both surfaces from the same base URL).
 */
export function setCustomProviderRegistry(entries: CustomProviderConfig[]): void {
  const text: Record<string, TextProvider> = {};
  const image: Record<string, ImageProvider> = {};
  for (const e of entries) {
    if (!e?.name || !e?.baseUrl) continue;
    try {
      text[e.name] = new CustomOpenAIText(e);
      image[e.name] = new CustomOpenAIImage(e);
    } catch {
      // Skip invalid entries silently — the route layer will have validated.
    }
  }
  _customTextProviders = text;
  _customImageProviders = image;
}
