/**
 * comic-creator — custom OpenAI-compatible provider adapters.
 *
 * Used for arbitrary OpenAI-API-compatible endpoints the user adds through
 * the WebUI Settings page (LocalAI, Ollama, vLLM, custom proxies, etc.).
 *
 * Each custom provider has a user-supplied name, baseUrl, optional apiKey,
 * and optional model. The adapters speak the standard OpenAI chat +
 * images wire format — same as OpenRouter and LM Studio — so any server
 * that follows that shape works.
 */

import { PNG } from 'pngjs';
import type { TextProvider, TextCompleteOptions } from './text.js';
import type { ImageProvider, ImageGenerateOptions } from './image.js';

export interface CustomProviderConfig {
  /** User-supplied name (the registry key). */
  name: string;
  /** OpenAI-compatible base URL, e.g. http://localhost:8080/v1 */
  baseUrl: string;
  /** Optional bearer token. */
  apiKey?: string;
  /** Default model id; can be overridden per-call. */
  model?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// CustomOpenAIText
// ---------------------------------------------------------------------------

export class CustomOpenAIText implements TextProvider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly defaultModel: string | undefined;

  constructor(cfg: CustomProviderConfig) {
    if (!cfg.name || !cfg.baseUrl) {
      throw new Error('CustomOpenAIText: name and baseUrl are required');
    }
    this.name = cfg.name;
    this.baseUrl = cfg.baseUrl;
    this.apiKey = cfg.apiKey;
    this.defaultModel = cfg.model;
  }

  async complete(prompt: string, opts: TextCompleteOptions = {}): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const messages: ChatMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: opts.model ?? this.defaultModel ?? 'default',
        messages,
        ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      }),
      // Per-call timeout for the same reason as the built-ins.
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(
        `${this.name} (custom) request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      );
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error(`${this.name} (custom): response missing choices[0].message.content`);
    }
    return content;
  }
}

// ---------------------------------------------------------------------------
// CustomOpenAIImage
// ---------------------------------------------------------------------------

interface OpenAIImageRequest {
  model: string;
  prompt: string;
  size?: string;
  n?: number;
}

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
}

export class CustomOpenAIImage implements ImageProvider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly defaultModel: string | undefined;

  constructor(cfg: CustomProviderConfig) {
    if (!cfg.name || !cfg.baseUrl) {
      throw new Error('CustomOpenAIImage: name and baseUrl are required');
    }
    this.name = cfg.name;
    this.baseUrl = cfg.baseUrl;
    this.apiKey = cfg.apiKey;
    this.defaultModel = cfg.model;
  }

  async generate(prompt: string, opts: ImageGenerateOptions = {}): Promise<Buffer> {
    const width = opts.width ?? 1024;
    const height = opts.height ?? 1024;
    const url = `${this.baseUrl.replace(/\/$/, '')}/images/generations`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const body: OpenAIImageRequest = {
      model: opts.model ?? this.defaultModel ?? 'default',
      prompt,
      size: `${width}x${height}`,
      ...(opts.n != null ? { n: opts.n } : {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(
        `${this.name} (custom image) request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      );
    }
    const json = (await res.json()) as OpenAIImageResponse;
    const first = json.data?.[0];
    if (!first) throw new Error(`${this.name} (custom image): response missing data[0]`);
    if (first.b64_json) return Buffer.from(first.b64_json, 'base64');
    if (first.url) {
      const imgRes = await fetch(first.url);
      if (!imgRes.ok) {
        throw new Error(`${this.name} (custom image): failed to fetch returned url (${imgRes.status})`);
      }
      const arr = new Uint8Array(await imgRes.arrayBuffer());
      return Buffer.from(arr);
    }
    throw new Error(`${this.name} (custom image): response had neither b64_json nor url`);
  }
}
