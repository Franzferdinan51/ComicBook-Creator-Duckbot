/**
 * comic-creator — ComfyUI text + image provider adapters.
 *
 * ComfyUI ships an OpenAI-compat server when started with the
 * `--enable-openai-api` flag (default port 8188). The endpoint shape is
 * the standard `chat/completions` + `images/generations`, so this
 * provider is functionally identical to the OpenRouter/lmstudio
 * adapters — it just points at a different default baseUrl.
 *
 * To use:
 *   1. Launch ComfyUI: `python main.py --enable-openai-api --port 8188`
 *   2. Set `COMFYUI_BASE_URL` if you're not using the default
 *      `http://127.0.0.1:8188/v1`.
 *   3. Set `COMFYUI_MODEL` to the name of a loaded checkpoint (e.g.
 *      `sd_xl_base_1.0.safetensors`, `flux1-dev-fp8.safetensors`).
 *      ComfyUI ignores the model field for routing, but the OpenAI
 *      shim requires *something* there.
 *
 * For image generation, ComfyUI's image endpoint supports the standard
 * `prompt` + `size` shape, but it doesn't speak the `response_format`
 * field — it always returns a URL or base64 depending on the workflow.
 * We request `b64_json`; if the server returns a URL, we follow it.
 *
 * Environment:
 *   - COMFYUI_BASE_URL (default: http://127.0.0.1:8188/v1)
 *   - COMFYUI_MODEL    (default: the first model id you saved in
 *                       openclaw.json, or "comfyui-default" if none)
 *
 * No API key is required for local ComfyUI. The local-loopback rule in
 * `providers/config.ts` skips the Authorization header when the
 * baseUrl is `127.0.0.1` / `localhost`.
 */

import type { TextProvider, TextCompleteOptions } from './text.js';
import type { ImageProvider, ImageGenerateOptions } from './image.js';
import { getProviderConfig } from './config.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// ComfyUIText
// ---------------------------------------------------------------------------

export class ComfyUIText implements TextProvider {
  name = 'comfyui';

  async complete(prompt: string, opts: TextCompleteOptions = {}): Promise<string> {
    const cfg = getProviderConfig('comfyui');
    const baseUrl = cfg.baseUrl ?? 'http://127.0.0.1:8188/v1';
    const model = opts.model ?? cfg.model ?? 'comfyui-default';
    // ComfyUI's OpenAI shim doesn't require auth on loopback. If the
    // user explicitly set a key (e.g. behind a reverse proxy), honor it.
    const apiKey = cfg.isLocal ? undefined : cfg.apiKey;
    const messages: ChatMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(
        `comfyui (text) request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      );
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('comfyui (text): response missing choices[0].message.content');
    }
    return content;
  }
}

// ---------------------------------------------------------------------------
// ComfyUIImage
// ---------------------------------------------------------------------------

interface ComfyUIImageRequest {
  model: string;
  prompt: string;
  size?: string;
  n?: number;
}

interface ComfyUIImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
}

export class ComfyUIImage implements ImageProvider {
  name = 'comfyui';

  async generate(prompt: string, opts: ImageGenerateOptions = {}): Promise<Buffer> {
    const cfg = getProviderConfig('comfyui');
    const baseUrl = (cfg.baseUrl ?? 'http://127.0.0.1:8188/v1').replace(/\/$/, '');
    const apiKey = cfg.isLocal ? undefined : cfg.apiKey;
    const model = opts.model ?? cfg.model ?? 'comfyui-default';
    const width = opts.width ?? 1024;
    const height = opts.height ?? 1024;

    const body: ComfyUIImageRequest = {
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
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(
        `comfyui (image) request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      );
    }
    const json = (await res.json()) as ComfyUIImageResponse;
    const first = json.data?.[0];
    if (!first) throw new Error('comfyui (image): response missing data[0]');
    if (first.b64_json) return Buffer.from(first.b64_json, 'base64');
    if (first.url) {
      const imgRes = await fetch(first.url);
      if (!imgRes.ok) {
        throw new Error(`comfyui (image): failed to fetch returned url (${imgRes.status})`);
      }
      const arr = new Uint8Array(await imgRes.arrayBuffer());
      return Buffer.from(arr);
    }
    throw new Error('comfyui (image): response had neither b64_json nor url');
  }
}
