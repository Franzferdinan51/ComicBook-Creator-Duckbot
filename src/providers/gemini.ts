/**
 * comic-creator — Google Gemini text + image provider adapters.
 *
 * Two surfaces, two shapes:
 *
 *   Text   → uses Google's OpenAI-compat shim at
 *            `https://generativelanguage.googleapis.com/v1beta/openai/`.
 *            Same wire format as OpenAI / OpenRouter / xAI. The model
 *            ids are the standard Gemini family (gemini-2.0-flash,
 *            gemini-2.5-pro, etc.).
 *
 *   Image  → uses the NATIVE `generateContent` endpoint at
 *            `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
 *            Image generation in Gemini is requested via
 *            `generationConfig.responseModalities: ["IMAGE"]` and the
 *            response carries base64-encoded inline data on the
 *            `candidates[0].content.parts[*].inlineData` field.
 *
 * Environment:
 *   - GEMINI_API_KEY  (also accepts GOOGLE_API_KEY as a synonym)
 *   - GEMINI_BASE_URL (default: https://generativelanguage.googleapis.com)
 *   - GEMINI_MODEL    (default: gemini-2.0-flash for text,
 *                      gemini-2.0-flash-exp for image)
 *
 * Known model ids (as of early 2026):
 *   Text:
 *     - gemini-2.5-pro
 *     - gemini-2.5-flash
 *     - gemini-2.0-flash
 *     - gemini-2.0-flash-lite
 *   Image (Imagen 3 via Gemini 2.0 Flash experimental):
 *     - gemini-2.0-flash-exp    (image-capable, current recommendation)
 *     - imagen-3.0-generate-002 (Imagen 3, native, on the predict endpoint)
 *
 * Reference: https://ai.google.dev/api/generate-content
 */

import type { TextProvider, TextCompleteOptions } from './text.js';
import type { ImageProvider, ImageGenerateOptions } from './image.js';
import { getProviderConfig } from './config.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// GeminiText — OpenAI-compat shim
// ---------------------------------------------------------------------------

const GEMINI_OPENAI_COMPAT_PATH = '/v1beta/openai';

export class GeminiText implements TextProvider {
  name = 'gemini';

  async complete(prompt: string, opts: TextCompleteOptions = {}): Promise<string> {
    const cfg = getProviderConfig('gemini');
    const apiKey = cfg.apiKey;
    if (!apiKey) {
      throw new Error('gemini: GEMINI_API_KEY (or GOOGLE_API_KEY) not set');
    }
    // The OpenAI-compat shim sits at /v1beta/openai under the base URL.
    // The base URL we store is the API root, so we append the path here.
    const baseUrl = (cfg.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const shimUrl = `${baseUrl}${GEMINI_OPENAI_COMPAT_PATH}`;
    const model = opts.model ?? cfg.model ?? 'gemini-2.0-flash';
    const messages: ChatMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });
    const url = `${shimUrl}/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    headers['Authorization'] = `Bearer ${apiKey}`;
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
        `gemini (text) request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      );
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('gemini (text): response missing choices[0].message.content');
    }
    return content;
  }
}

// ---------------------------------------------------------------------------
// GeminiImage — native generateContent with image response modality
// ---------------------------------------------------------------------------

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiGenerateContentRequest {
  contents: Array<{ parts: GeminiPart[] }>;
  generationConfig: {
    responseModalities: Array<'TEXT' | 'IMAGE'>;
    temperature?: number;
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  // Newer Gemini API responses also include a top-level `error` shape on
  // partial failures; surface those for clearer debugging.
  error?: { code?: number; message?: string; status?: string };
}

function pickDefaultImageModel(raw: string | undefined): string {
  if (!raw) return 'gemini-2.0-flash-exp';
  // If the configured model is a text model (no "image" in the name),
  // fall through to the image-capable default. Otherwise trust it.
  if (raw.includes('image') || raw.includes('imagen') || raw.includes('flash-exp')) {
    return raw;
  }
  return 'gemini-2.0-flash-exp';
}

export class GeminiImage implements ImageProvider {
  name = 'gemini';

  async generate(prompt: string, opts: ImageGenerateOptions = {}): Promise<Buffer> {
    const cfg = getProviderConfig('gemini');
    const apiKey = cfg.apiKey;
    if (!apiKey) {
      throw new Error('gemini: GEMINI_API_KEY (or GOOGLE_API_KEY) not set');
    }
    const baseUrl = (cfg.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const model = pickDefaultImageModel(opts.model ?? cfg.model);
    const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const body: GeminiGenerateContentRequest = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Google's auth header is the API key as a custom header, NOT a
        // bearer token. The OpenAI-compat shim uses Bearer, but the
        // native endpoint uses this.
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(
        `gemini (image) request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      );
    }
    const json = (await res.json()) as GeminiGenerateContentResponse;
    if (json.error) {
      throw new Error(`gemini (image): API error ${json.error.code ?? '?'} — ${json.error.message ?? 'unknown'}`);
    }
    const parts = json.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error('gemini (image): response had no content parts');
    }
    // Find the first inlineData part — that's the image bytes (base64).
    for (const part of parts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }
    // Some models only return text (e.g. if safety filters tripped). If
    // we got text back, surface it so the user can see why.
    const textParts = parts.filter((p) => p.text).map((p) => p.text).join(' ');
    throw new Error(
      `gemini (image): no image data in response${textParts ? ` — model said: ${textParts.slice(0, 300)}` : ''}`
    );
  }
}
