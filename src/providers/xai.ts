/**
 * comic-creator — xAI (Grok) text + image provider adapters.
 *
 * xAI's API is OpenAI-compatible: same `chat/completions` for text, same
 * `images/generations` for image gen. We just point the same code paths
 * at `https://api.x.ai/v1` instead of OpenAI/OpenRouter.
 *
 * Environment:
 *   - XAI_API_KEY (required for remote calls; localhost ComfyUI doesn't
 *     need one if you wire ComfyUI under the same `xai` provider name,
 *     but the canonical Grok path is remote.)
 *   - XAI_BASE_URL (default: https://api.x.ai/v1)
 *   - XAI_MODEL     (default: grok-2-latest for text, grok-2-image for image)
 *
 * Known model ids (as of early 2026):
 *   Text:
 *     - grok-2-latest         (current production Grok, recommended)
 *     - grok-2-1212          (snapshot)
 *     - grok-beta             (preview of the next major)
 *     - grok-2-vision-1212    (vision-capable; useful for image-to-text)
 *   Image (Grok Imagine):
 *     - grok-2-image          (current image model)
 *
 * Reference: https://docs.x.ai/docs/models
 */

import type { TextProvider, TextCompleteOptions } from './text.js';
import type { ImageProvider, ImageGenerateOptions } from './image.js';
import { getProviderConfig } from './config.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// Shared OpenAI-compat POST helper (same shape as text.ts uses for the
// other providers — we duplicate it here to keep xAI's failure modes
// independent if xAI ships an endpoint quirk).
// ---------------------------------------------------------------------------

async function callChat(args: {
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const url = `${args.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (args.apiKey) headers['Authorization'] = `Bearer ${args.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      ...(args.maxTokens != null ? { max_tokens: args.maxTokens } : {}),
      ...(args.temperature != null ? { temperature: args.temperature } : {}),
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>');
    throw new Error(
      `xai (text) request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
    );
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('xai (text): response missing choices[0].message.content');
  }
  return content;
}

// ---------------------------------------------------------------------------
// XAIText
// ---------------------------------------------------------------------------

export class XAIText implements TextProvider {
  name = 'xai';

  async complete(prompt: string, opts: TextCompleteOptions = {}): Promise<string> {
    const cfg = getProviderConfig('xai');
    const apiKey = cfg.apiKey;
    if (!apiKey) {
      throw new Error('xai: XAI_API_KEY not set');
    }
    const baseUrl = cfg.baseUrl ?? 'https://api.x.ai/v1';
    const model = opts.model ?? cfg.model ?? 'grok-2-latest';
    const messages: ChatMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });
    return callChat({
      baseUrl,
      apiKey,
      model,
      messages,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
  }
}

// ---------------------------------------------------------------------------
// XAIImage — Grok Imagine via /images/generations
// xAI's image gen returns either a hosted URL or a base64 string. We
// download the URL form into a Buffer so downstream code (PDF embed)
// doesn't need to know the difference.
// ---------------------------------------------------------------------------

interface XAIImageRequest {
  model: string;
  prompt: string;
  n?: number;
  response_format?: 'url' | 'b64_json';
}

interface XAIImageResponse {
  data?: Array<{ url?: string; b64_json?: string }>;
}

export class XAIImage implements ImageProvider {
  name = 'xai';

  async generate(prompt: string, opts: ImageGenerateOptions = {}): Promise<Buffer> {
    const cfg = getProviderConfig('xai');
    const apiKey = cfg.apiKey;
    if (!apiKey) {
      throw new Error('xai: XAI_API_KEY not set');
    }
    const baseUrl = (cfg.baseUrl ?? 'https://api.x.ai/v1').replace(/\/$/, '');
    // xAI's image model is "grok-2-image" / "grok-imagine". Default
    // to grok-2-image if the user-supplied model is a text model.
    const fallback = 'grok-2-image';
    const model = opts.model ?? (cfg.model && cfg.model.includes('image') ? cfg.model : fallback);
    const body: XAIImageRequest = {
      model,
      prompt,
      n: opts.n ?? 1,
      response_format: 'b64_json',
    };
    const url = `${baseUrl}/images/generations`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(
        `xai (image) request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      );
    }
    const json = (await res.json()) as XAIImageResponse;
    const first = json.data?.[0];
    if (!first) throw new Error('xai (image): response missing data[0]');
    if (first.b64_json) return Buffer.from(first.b64_json, 'base64');
    if (first.url) {
      const imgRes = await fetch(first.url);
      if (!imgRes.ok) {
        throw new Error(`xai (image): failed to fetch returned url (${imgRes.status})`);
      }
      const arr = new Uint8Array(await imgRes.arrayBuffer());
      return Buffer.from(arr);
    }
    throw new Error('xai (image): response had neither b64_json nor url');
  }
}
