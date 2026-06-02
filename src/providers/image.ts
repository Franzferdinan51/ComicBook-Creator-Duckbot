/**
 * comic-creator — image provider adapters.
 *
 * Four implementations of `ImageProvider`:
 *   - OpenRouterImage  → routes to FLUX / DALL-E / etc. via OpenRouter's image API
 *   - LMStudioImage    → local image model (e.g. SDXL) via the OpenAI-compatible /v1/images endpoint
 *   - MiniMaxImage     → MiniMax image-generation endpoint
 *   - MockImage        → deterministic 256x256 PNG, color derived from prompt hash
 *
 * Every real call has a 3-minute per-image timeout (image generation
 * is slower than text, especially FLUX/sdxl on CPU). A hung upstream
 * server aborts the fetch and bubbles a clear error to the job.
 *
 * Real providers throw a clear error if their API key is missing — they do
 * NOT silently fall back to mock. The test harness can catch the throw and
 * report it as "skipped (no config)".
 *
 * Returns: a PNG buffer suitable for writing to disk and embedding in a PDF.
 */

import { PNG } from 'pngjs';
import { getProviderConfig } from './config.js';

export interface ImageGenerateOptions {
  width?: number;
  height?: number;
  /** Aspect ratio like "16:9", "1:1". Providers map these to canonical
   *  pixel sizes. Mutually exclusive with width+height. */
  aspectRatio?: string;
  style?: string;
  negativePrompt?: string;
  /** Optional model override. Falls back to the provider's configured default. */
  model?: string;
  /** Number of images to generate. Default 1. */
  n?: number;
  /** Sampling temperature 0-2. Provider-specific defaults apply if omitted. */
  temperature?: number;
  /** For MiniMax: let the API rewrite the prompt for better results. */
  promptOptimizer?: boolean;
  /** For MiniMax: embed an AI-generated watermark in the output image. */
  aigcWatermark?: boolean;
  /** For MiniMax: subject reference(s) for character consistency. */
  subjectReference?: Array<{
    type: string;
    image_url?: string;
    image_file?: string;
  }>;
  /** Reproducible generation seed. */
  seed?: number;
  /** "base64" (default) or "url" — how the provider returns the image bytes. */
  responseFormat?: 'base64' | 'url';
}

export interface ImageProvider {
  name: string;
  generate(prompt: string, opts?: ImageGenerateOptions): Promise<Buffer>;
}

function requireApiKey(providerLabel: string, envVarName: string, key: string | undefined): string {
  if (!key) {
    throw new Error(`${providerLabel}: ${envVarName} not set`);
  }
  return key;
}

/** Per-image timeout. 3 minutes is generous for FLUX, conservative for
 *  SDXL on a beefy GPU. Anything longer than this is almost certainly
 *  a hung server. */
const IMAGE_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// OpenRouterImage — uses OpenRouter's /images/generations endpoint when the
// underlying model supports it. We default to "black-forest-labs/flux.1-schnell"
// which is broadly available.
// ---------------------------------------------------------------------------

interface OpenRouterImageRequest {
  model: string;
  prompt: string;
  width?: number;
  height?: number;
  n?: number;
}

interface OpenRouterImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
}

export class OpenRouterImage implements ImageProvider {
  name = 'openrouter';

  async generate(prompt: string, opts: ImageGenerateOptions = {}): Promise<Buffer> {
    const cfg = getProviderConfig('openrouter');
    const apiKey = requireApiKey('openrouter', 'OPENROUTER_API_KEY', cfg.apiKey);
    const baseUrl = (cfg.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const model = opts.model ?? cfg.model ?? 'black-forest-labs/flux.1-schnell';

    const body: OpenRouterImageRequest = {
      model,
      prompt,
      ...(opts.width != null ? { width: opts.width } : {}),
      ...(opts.height != null ? { height: opts.height } : {}),
      ...(opts.n != null ? { n: opts.n } : {}),
    };

    const url = `${baseUrl}/images/generations`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/openclaw/comic-creator',
        'X-Title': 'comic-creator',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(
        `openrouter (image) request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      );
    }
    const json = (await res.json()) as OpenRouterImageResponse;
    const first = json.data?.[0];
    if (!first) {
      throw new Error('openrouter (image): response missing data[0]');
    }
    if (first.b64_json) {
      return Buffer.from(first.b64_json, 'base64');
    }
    if (first.url) {
      const imgRes = await fetch(first.url);
      if (!imgRes.ok) {
        throw new Error(`openrouter (image): failed to fetch returned url (${imgRes.status})`);
      }
      const arr = new Uint8Array(await imgRes.arrayBuffer());
      return Buffer.from(arr);
    }
    throw new Error('openrouter (image): response had neither b64_json nor url');
  }
}

// ---------------------------------------------------------------------------
// LMStudioImage — local image model via /v1/images/generations
//   (LM Studio exposes an OpenAI-compatible images endpoint when an image
//    model is loaded).
// ---------------------------------------------------------------------------

interface LMStudioImageRequest {
  model: string;
  prompt: string;
  size?: string;
  n?: number;
}

interface LMStudioImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
}

export class LMStudioImage implements ImageProvider {
  name = 'lmstudio';

  async generate(prompt: string, opts: ImageGenerateOptions = {}): Promise<Buffer> {
    const cfg = getProviderConfig('lmstudio');
    const baseUrl = (cfg.baseUrl ?? 'http://127.0.0.1:1234/v1').replace(/\/$/, '');
    // For local LM Studio, skip the Authorization header (the stored key in
    // openclaw.json is often stale; the local server doesn't need it).
    const apiKey = !cfg.isLocal && cfg.apiKey ? cfg.apiKey : undefined;
    const model = opts.model ?? cfg.model ?? 'sdxl';

    const width = opts.width ?? 512;
    const height = opts.height ?? 512;

    const body: LMStudioImageRequest = {
      model,
      prompt,
      size: `${width}x${height}`,
      ...(opts.n != null ? { n: opts.n } : {}),
    };

    const url = `${baseUrl}/images/generations`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(
        `lmstudio (image) request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      );
    }
    const json = (await res.json()) as LMStudioImageResponse;
    const first = json.data?.[0];
    if (!first) throw new Error('lmstudio (image): response missing data[0]');
    if (first.b64_json) return Buffer.from(first.b64_json, 'base64');
    if (first.url) {
      const imgRes = await fetch(first.url);
      if (!imgRes.ok) {
        throw new Error(`lmstudio (image): failed to fetch returned url (${imgRes.status})`);
      }
      const arr = new Uint8Array(await imgRes.arrayBuffer());
      return Buffer.from(arr);
    }
    throw new Error('lmstudio (image): response had neither b64_json nor url');
  }
}

// ---------------------------------------------------------------------------
// MiniMaxImage
//   Endpoint: POST {baseUrl}/v1/image_generation
//   Auth:     Bearer <MINIMAX_API_KEY> (or x-api-key for some endpoints)
//   Shape aligned with the official MiniMax CLI
//   (https://github.com/MiniMax-AI/cli, src/sdk/image/index.ts):
//     - model                string, default "image-01"
//     - prompt               string, required
//     - aspect_ratio         "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9" …
//     - width, height        explicit pixel dims (512–2048, multiple of 8)
//     - n                    batch count (default 1)
//     - seed                 for reproducible runs
//     - prompt_optimizer     bool — let MiniMax rewrite the prompt
//     - aigc_watermark       bool — embed an AI-generated watermark
//     - response_format      "base64" | "url" (default "base64" here)
//     - subject_reference    optional character-consistency refs
//   The text provider may be configured against the anthropic-compat base URL
//   (`.../anthropic/v1`), but image gen lives on the native path. We always
//   strip a trailing `/anthropic/v1` (or `/anthropic`) from the baseUrl before
//   calling the image endpoint.
// ---------------------------------------------------------------------------

const VALID_ASPECT_RATIOS = [
  '1:1', '4:3', '3:4', '16:9', '9:16', '21:9', '2:3', '3:2', '5:4', '4:5',
] as const;
type AspectRatio = (typeof VALID_ASPECT_RATIOS)[number];

/** Map a text-friendly aspect ratio to the nearest w/h pixel pair the
 *  MiniMax API accepts (image-01 requires w,h in [512, 2048] and multiple
 *  of 8). 1024 is a sensible base; we pick the closest side within bounds. */
const ASPECT_TO_PIXELS: Record<AspectRatio, { width: number; height: number }> = {
  '1:1':  { width: 1024, height: 1024 },
  '4:3':  { width: 1024, height: 768 },
  '3:4':  { width: 768,  height: 1024 },
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720,  height: 1280 },
  '21:9': { width: 1680, height: 720 },
  '2:3':  { width: 720,  height: 1080 },
  '3:2':  { width: 1080, height: 720 },
  '5:4':  { width: 1024, height: 819 }, // 819 = 1024 * 4/5 rounded
  '4:5':  { width: 819,  height: 1024 },
};

function isValidAspectRatio(s: string): s is AspectRatio {
  return (VALID_ASPECT_RATIOS as readonly string[]).includes(s);
}

interface MiniMaxImageRequest {
  model: string;
  prompt: string;
  /** "1:1" | "4:3" | … — required unless width+height are set. */
  aspect_ratio?: AspectRatio;
  /** Explicit pixel dimensions (512–2048, multiple of 8). */
  width?: number;
  height?: number;
  n?: number;
  seed?: number;
  /** Let MiniMax rewrite the prompt for better results. */
  prompt_optimizer?: boolean;
  /** Embed an AI-generated watermark in the output image. */
  aigc_watermark?: boolean;
  /** "base64" (returned inline) or "url" (CDN download). */
  response_format: 'base64' | 'url';
  /** Subject reference for character consistency (advanced; CLI uses
   *  --subject-ref). */
  subject_reference?: Array<{
    type: string;
    image_url?: string;
    image_file?: string;
  }>;
}

interface MiniMaxImageResponse {
  // Native MiniMax wraps the data in an object, not a top-level array.
  data?: {
    image_base64?: string[];
    image_urls?: string[];
    task_id?: string;
    success_count?: number;
    failed_count?: number;
  };
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
}

function nativeImageBaseUrl(stored: string | undefined): string {
  const fallback = 'https://api.minimax.io/v1';
  if (!stored) return fallback;
  // Replace "/anthropic/v1" with "/v1" so we hit the native image API,
  // not the anthropic-compat shim. The image endpoint is always at /v1.
  const stripped = stored
    .replace(/\/anthropic\/v1\/?$/i, '/v1')
    .replace(/\/anthropic\/?$/i, '/v1');
  // If the strip produced a base without a /v1 segment, append it.
  if (!/\/v\d+\/?$/i.test(stripped)) {
    return stripped.replace(/\/?$/, '') + '/v1';
  }
  return stripped;
}

/** Validate width/height per the MiniMax image-01 contract:
 *  range [512, 2048] and multiple of 8. */
function validateMiniMaxSize(name: string, val: number): void {
  if (!Number.isFinite(val) || !Number.isInteger(val)) {
    throw new Error(`minimax (image): --${name} must be an integer, got ${val}`);
  }
  if (val < 512 || val > 2048) {
    throw new Error(`minimax (image): --${name} must be between 512 and 2048, got ${val}`);
  }
  if (val % 8 !== 0) {
    throw new Error(`minimax (image): --${name} must be a multiple of 8, got ${val}`);
  }
}

/** Map a MiniMax API error code to a readable message. Codes come from
 *  MiniMax's `base_resp.status_code` field. See the CLI's
 *  `src/errors/api.ts` for the canonical mapping. */
function miniMaxErrorMessage(code: number | undefined, fallback: string): string {
  switch (code) {
    case 1002:  return 'minimax (image): rate limited — slow down and retry';
    case 1004:  return 'minimax (image): authentication failed — check your API key';
    case 1008:  return 'minimax (image): insufficient balance — top up your account';
    case 1026:  return 'minimax (image): content filtered by safety system';
    case 2013:  return 'minimax (image): invalid parameters — check model/size/prompt';
    case 2049:  return 'minimax (image): invalid API key';
    default:    return fallback;
  }
}

export class MiniMaxImage implements ImageProvider {
  name = 'minimax';

  async generate(prompt: string, opts: ImageGenerateOptions = {}): Promise<Buffer> {
    const cfg = getProviderConfig('minimax');
    const apiKey = requireApiKey('minimax', 'MINIMAX_API_KEY', cfg.apiKey);
    const baseUrl = nativeImageBaseUrl(cfg.baseUrl);
    // For MiniMax, the text model (e.g. "MiniMax-M3") is NOT a valid image model
    // — the image endpoint needs a separate image model id. Default to
    // `image-01` (the documented MiniMax image model) and let the user override
    // via opts.model when they wire a different one up. Common values:
    //   - "image-01"          current recommended
    //   - "image-01-live"     the live variant (per the official CLI)
    const model = opts.model ?? 'image-01';

    // Size resolution per the MiniMax CLI's logic:
    //   1. If both width AND height are provided explicitly, use them
    //      (and validate 512..2048, multiple of 8).
    //   2. Otherwise, accept an aspect_ratio string (mapped to canonical
    //      pixel dimensions) — see `ASPECT_TO_PIXELS`.
    //   3. If neither is provided, fall back to 1024x1024.
    let width: number | undefined = opts.width;
    let height: number | undefined = opts.height;
    let aspectRatio: AspectRatio | undefined;
    if (width != null && height != null) {
      validateMiniMaxSize('width', width);
      validateMiniMaxSize('height', height);
    } else if (width != null || height != null) {
      throw new Error('minimax (image): both width and height must be provided together');
    } else if (opts.aspectRatio) {
      if (!isValidAspectRatio(opts.aspectRatio)) {
        throw new Error(
          `minimax (image): invalid aspect_ratio "${opts.aspectRatio}". ` +
          `Valid: ${VALID_ASPECT_RATIOS.join(', ')}`
        );
      }
      aspectRatio = opts.aspectRatio;
      const px = ASPECT_TO_PIXELS[aspectRatio];
      width = px.width;
      height = px.height;
    } else {
      // Default to 1:1 — matches the CLI's `aspect_ratio` default.
      aspectRatio = '1:1';
      width = ASPECT_TO_PIXELS['1:1'].width;
      height = ASPECT_TO_PIXELS['1:1'].height;
    }

    const body: MiniMaxImageRequest = {
      model,
      prompt,
      n: opts.n ?? 1,
      response_format: opts.responseFormat === 'url' ? 'url' : 'base64',
      width,
      height,
      // Per the MiniMax CLI: when width+height are explicit, aspect_ratio
      // is unset. When they're not, we set it.
      ...(width != null && height != null && !aspectRatio ? {} : { aspect_ratio: aspectRatio }),
      ...(opts.seed != null ? { seed: opts.seed } : {}),
      ...(opts.promptOptimizer === true ? { prompt_optimizer: true } : {}),
      ...(opts.aigcWatermark === true ? { aigc_watermark: true } : {}),
      ...(opts.subjectReference && opts.subjectReference.length > 0
        ? { subject_reference: opts.subjectReference }
        : {}),
      ...(opts.style != null ? { style: opts.style } : {}),
      ...(opts.negativePrompt != null ? { negative_prompt: opts.negativePrompt } : {}),
    };

    const url = `${baseUrl.replace(/\/$/, '')}/image_generation`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(
        `minimax (image) request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      );
    }
    const rawText = await res.text();
    let json: MiniMaxImageResponse & Record<string, unknown>;
    try {
      json = JSON.parse(rawText) as MiniMaxImageResponse & Record<string, unknown>;
    } catch (err) {
      throw new Error(`minimax (image): response is not valid JSON — ${rawText.slice(0, 300)}`);
    }

    // Per the CLI's behavior: surface MiniMax's `base_resp.status_code`
    // as a readable error even when HTTP 200.
    if (json.base_resp?.status_code && json.base_resp.status_code !== 0) {
      const code = json.base_resp.status_code;
      const msg = json.base_resp.status_msg ?? '';
      throw new Error(miniMaxErrorMessage(code, `minimax (image): API error ${code} ${msg}`));
    }

    // Empty success_count with no images is an error.
    if (json.data?.failed_count && json.data.failed_count > 0 && (!json.data.image_base64?.length && !json.data.image_urls?.length)) {
      throw new Error(
        `minimax (image): generation failed — ${json.data.failed_count} of ${json.data.failed_count + (json.data.success_count ?? 0)} images failed`
      );
    }

    const b64 = json.data?.image_base64?.[0];
    if (b64) return Buffer.from(b64, 'base64');
    const url2 = json.data?.image_urls?.[0];
    if (url2) {
      const imgRes = await fetch(url2);
      if (!imgRes.ok) {
        throw new Error(`minimax (image): failed to fetch returned url (${imgRes.status})`);
      }
      const arr = new Uint8Array(await imgRes.arrayBuffer());
      return Buffer.from(arr);
    }
    // Debug aid: surface the actual response shape so the operator can see
    // what the API returned (e.g. if the model rejected the prompt).
    throw new Error(
      `minimax (image): response had neither image_base64 nor image_urls. ` +
      `base_resp=${JSON.stringify(json.base_resp ?? json.base_resp_v2 ?? 'n/a')}, ` +
      `data=${JSON.stringify(json.data).slice(0, 200)}`
    );
  }
}

// ---------------------------------------------------------------------------
// MockImage — deterministic 256x256 solid-color PNG.
// Color is derived from the prompt's FNV-1a hash, so the same prompt always
// picks the same color.
// ---------------------------------------------------------------------------

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hashToRgb(prompt: string): { r: number; g: number; b: number } {
  const h = fnv1a(prompt);
  // Three independent pseudo-random bytes from the hash.
  const r = (h >>> 16) & 0xff;
  const g = (h >>> 8) & 0xff;
  const b = h & 0xff;
  return { r, g, b };
}

function buildSolidPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const png = new PNG({ width, height, colorType: 2 }); // 2 = RGB
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 0xff; // opaque
    }
  }
  // PNG.prototype.pack() is async (returns the stream) — use the sync writer
  // from png-sync to get a real Buffer back.
  return PNG.sync.write(png);
}

export class MockImage implements ImageProvider {
  name = 'mock';

  async generate(prompt: string, opts: ImageGenerateOptions = {}): Promise<Buffer> {
    const width = opts.width ?? 256;
    const height = opts.height ?? 256;
    const { r, g, b } = hashToRgb(prompt);
    return buildSolidPng(width, height, r, g, b);
  }
}
