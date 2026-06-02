/**
 * comic-creator — text provider adapters.
 *
 * Four implementations of `TextProvider`:
 *   - OpenRouterText  → POST {baseUrl}/chat/completions
 *   - LMStudioText    → POST http://127.0.0.1:1234/v1/chat/completions
 *   - MiniMaxText     → POST https://api.minimax.io/v1/text/chatcompletion_v2
 *   - MockText        → deterministic JSON-shaped string
 *
 * Real providers throw a clear error if their API key is missing — they do
 * NOT silently fall back to mock. The test harness can catch the throw and
 * report it as "skipped (no config)".
 */

import { getProviderConfig } from './config.js';

export interface TextCompleteOptions {
  /** Optional system message. */
  system?: string;
  /** Max tokens to generate. Provider-specific defaults apply if omitted. */
  maxTokens?: number;
  /** Sampling temperature 0-2. Provider-specific defaults apply if omitted. */
  temperature?: number;
  /** Optional model override. Falls back to the provider's default model. */
  model?: string;
}

export interface TextProvider {
  name: string;
  complete(prompt: string, opts?: TextCompleteOptions): Promise<string>;
}

// ---------------------------------------------------------------------------
// Shared helper: OpenAI-compatible chat/completions POST.
// Used by OpenRouter and LM Studio (both speak the same wire format).
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionsRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: false;
}

async function callOpenAICompatibleChat(args: {
  providerLabel: string;
  baseUrl: string;
  apiKey: string | undefined;
  authHeaderName: 'Authorization' | 'x-api-key';
  authHeaderPrefix: string;
  body: ChatCompletionsRequest;
  extraHeaders?: Record<string, string>;
}): Promise<string> {
  const url = `${args.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(args.extraHeaders ?? {}),
  };
  if (args.apiKey) {
    headers[args.authHeaderName] = `${args.authHeaderPrefix}${args.apiKey}`;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(args.body),
    // Per-call timeout. The same signal is honored by all built-in
    // providers so a hung upstream server doesn't pin a comic job
    // forever. (Node 20+: AbortSignal.timeout is available globally.)
    signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>');
    throw new Error(
      `${args.providerLabel} request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
    );
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`${args.providerLabel}: response missing choices[0].message.content`);
  }
  return content;
}

function requireApiKey(providerLabel: string, envVarName: string, key: string | undefined): string {
  if (!key) {
    throw new Error(`${providerLabel}: ${envVarName} not set`);
  }
  return key;
}

/** Default per-call timeout for text completion. Tuned to be longer than
 *  the slowest real-world model (MiniMax-M3 + a 4k script: ~30s) but
 *  short enough that a hung connection doesn't pin a job forever. */
const TEXT_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// OpenRouterText
// ---------------------------------------------------------------------------

export class OpenRouterText implements TextProvider {
  name = 'openrouter';

  async complete(prompt: string, opts: TextCompleteOptions = {}): Promise<string> {
    const cfg = getProviderConfig('openrouter');
    const apiKey = requireApiKey('openrouter', 'OPENROUTER_API_KEY', cfg.apiKey);
    const baseUrl = cfg.baseUrl ?? 'https://openrouter.ai/api/v1';
    const model = opts.model ?? cfg.model ?? 'openrouter/auto';

    const messages: ChatMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    return callOpenAICompatibleChat({
      providerLabel: 'openrouter',
      baseUrl,
      apiKey,
      authHeaderName: 'Authorization',
      authHeaderPrefix: 'Bearer ',
      body: {
        model,
        messages,
        ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      },
      extraHeaders: {
        // OpenRouter recommends these for proper routing attribution.
        'HTTP-Referer': 'https://github.com/openclaw/comic-creator',
        'X-Title': 'comic-creator',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// LMStudioText — local OpenAI-compatible server, no key required.
// ---------------------------------------------------------------------------

export class LMStudioText implements TextProvider {
  name = 'lmstudio';

  async complete(prompt: string, opts: TextCompleteOptions = {}): Promise<string> {
    const cfg = getProviderConfig('lmstudio');
    const baseUrl = cfg.baseUrl ?? 'http://127.0.0.1:1234/v1';
    const model = opts.model ?? cfg.model ?? 'qwen3.6-27b';
    // For local LM Studio servers, don't send Authorization at all unless
    // the key is explicitly set via env (LMSTUDIO_API_KEY) — many users
    // leave the apiKey field as a stale/placeholder value in openclaw.json
    // and the local server rejects "Bearer junk".
    const apiKey = !cfg.isLocal && cfg.apiKey ? cfg.apiKey : undefined;

    const messages: ChatMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    return callOpenAICompatibleChat({
      providerLabel: 'lmstudio',
      baseUrl,
      apiKey,
      authHeaderName: 'Authorization',
      authHeaderPrefix: 'Bearer ',
      body: {
        model,
        messages,
        ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// MiniMaxText
//   Two API shapes supported:
//   1. Native:   POST {baseUrl}/text/chatcompletion_v2
//                Authorization: Bearer <MINIMAX_API_KEY>
//                body: { model, messages: [{role, content}], max_tokens, temperature }
//                reply: { choices: [{ message: { content } }] }
//   2. Anthropic-compat (default for `minimax-portal` in openclaw.json):
//                POST {baseUrl}/messages
//                x-api-key: <MINIMAX_API_KEY>
//                anthropic-version: 2023-06-01
//                body: { model, max_tokens, messages: [{role, content}], system? }
//                reply: { content: [{type:'text', text:'...'}], ... }
//   The provider auto-detects via the configured baseUrl: if it contains
//   "/anthropic/" or the openclaw.json entry declares api="anthropic-messages",
//   the Anthropic shape is used. Otherwise native.
// ---------------------------------------------------------------------------

interface MiniMaxChatRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
}

interface MiniMaxChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface AnthropicMessagesRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  system?: string;
}

interface AnthropicMessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
  // Stop reason is also returned but we don't use it.
}

export class MiniMaxText implements TextProvider {
  name = 'minimax';

  async complete(prompt: string, opts: TextCompleteOptions = {}): Promise<string> {
    const cfg = getProviderConfig('minimax');
    const apiKey = requireApiKey('minimax', 'MINIMAX_API_KEY', cfg.apiKey);
    const baseUrl = cfg.baseUrl ?? 'https://api.minimax.io/v1';
    const model = opts.model ?? cfg.model ?? 'minimax/minimax';
    const useAnthropic = cfg.apiStyle === 'anthropic-messages';

    if (useAnthropic) {
      return this.completeAnthropic(apiKey, baseUrl, model, prompt, opts);
    }
    return this.completeNative(apiKey, baseUrl, model, prompt, opts);
  }

  private async completeAnthropic(
    apiKey: string,
    baseUrl: string,
    model: string,
    prompt: string,
    opts: TextCompleteOptions
  ): Promise<string> {
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    const body: AnthropicMessagesRequest = {
      model,
      messages,
      // Anthropic API requires max_tokens — default to a reasonable cap.
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      ...(opts.system ? { system: opts.system } : {}),
    };

    const url = `${baseUrl.replace(/\/$/, '')}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(
        `minimax (anthropic) request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      );
    }
    const json = (await res.json()) as AnthropicMessagesResponse;
    // Concatenate all text blocks (the API can return multiple, e.g. thinking + answer).
    const blocks = json.content ?? [];
    const text = blocks
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('');
    if (!text) {
      throw new Error('minimax (anthropic): response had no text content blocks');
    }
    return text;
  }

  private async completeNative(
    apiKey: string,
    baseUrl: string,
    model: string,
    prompt: string,
    opts: TextCompleteOptions
  ): Promise<string> {
    const messages: ChatMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const body: MiniMaxChatRequest = {
      model,
      messages,
      ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    };

    const url = `${baseUrl.replace(/\/$/, '')}/text/chatcompletion_v2`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(
        `minimax request failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
      );
    }
    const json = (await res.json()) as MiniMaxChatResponse;
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('minimax: response missing choices[0].message.content');
    }
    return content;
  }
}

interface MiniMaxChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  // The real API also returns a `reply` field in some modes — we ignore that
  // and use the OpenAI-style `choices` path for compatibility.
}

// ---------------------------------------------------------------------------
// MockText — deterministic JSON-shaped output for "make a comic about <story>"
// ---------------------------------------------------------------------------

/** Quick deterministic 32-bit hash (FNV-1a) so the same prompt always picks the same seed. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function extractStory(prompt: string): string {
  // Try a few common phrasings; default to the whole prompt.
  const patterns = [
    /make a comic about\s+(.+?)(?:[.!?\n]|$)/i,
    /comic about\s+(.+?)(?:[.!?\n]|$)/i,
    /story:\s*(.+?)(?:[.!?\n]|$)/i,
  ];
  for (const p of patterns) {
    const m = prompt.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return prompt.trim();
}

export class MockText implements TextProvider {
  name = 'mock';

  async complete(prompt: string, opts: TextCompleteOptions = {}): Promise<string> {
    const story = extractStory(prompt);
    const seed = (opts.maxTokens ?? 0) > 0 ? fnv1a(story) : fnv1a(story);
    // Deterministic 4-page × 4-panel script that always validates against ComicScript.
    const script = {
      title: `Mock Comic: ${story.slice(0, 40)}`,
      artStyle: 'manga',
      pages: [
        {
          pageNumber: 1,
          layout: 'grid-2x2',
          panels: [
            { id: 'p1-panel1', description: `Opening shot: ${story}` },
            { id: 'p1-panel2', description: `${story} — establishing the scene`, dialogue: ['What is happening?'] },
            { id: 'p1-panel3', description: `${story} — character reacts`, dialogue: ['Whoa!'], caption: 'Meanwhile...' },
            { id: 'p1-panel4', description: `${story} — wide shot` },
          ],
        },
        {
          pageNumber: 2,
          layout: 'grid-2x2',
          panels: [
            { id: 'p2-panel1', description: `${story} — closer view` },
            { id: 'p2-panel2', description: `${story} — dramatic moment` },
            { id: 'p2-panel3', description: `${story} — turning point` },
            { id: 'p2-panel4', description: `${story} — cliffhanger`, dialogue: ['To be continued...'] },
          ],
        },
      ],
      _mock: true,
      _seed: seed,
    };
    return JSON.stringify(script);
  }
}
