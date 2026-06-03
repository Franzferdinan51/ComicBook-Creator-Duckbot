/**
 * comic-creator server — API routes.
 *
 * Wires the Express router to the job manager, storage layer, and provider
 * registry. Every route is documented in the README. Keep JSDoc tight —
 * the frontend task will build to this contract.
 *
 * Endpoints (all JSON unless noted):
 *   GET    /api/health                 — liveness probe
 *   GET    /api/providers              — list of providers + availability
 *   GET    /api/settings               — read user settings
 *   PUT    /api/settings               — write user settings (partial)
 *   GET    /api/provider-overrides              — list user-supplied provider credentials (masked)
 *   PUT    /api/provider-overrides/:name        — set apiKey and/or baseUrl for a provider
 *   DELETE /api/provider-overrides/:name        — clear the user's override for a provider
 *   POST   /api/provider-overrides/:name/test   — make a real call with the current config
 *   POST   /api/comic                  — kick off a new comic
 *   GET    /api/comic/:jobId           — poll job status
 *   GET    /api/comic/:jobId/pdf       — stream the PDF (Content-Type: application/pdf)
 *   GET    /api/comic/:jobId/images/:panelId — single panel PNG/JPEG
 *   GET    /api/comic/:jobId/cover           — cover/title-page image (if generated)
 *   POST   /api/comic/:jobId/regenerate — re-run with new options
 *   GET    /api/history                — list recent jobs
 *   DELETE /api/history/:jobId         — remove a job from history
 */

import { Router, type Request, type Response } from 'express';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getJobManager, type JobStatus } from './jobs.js';
import {
  loadHistory,
  removeHistoryEntry,
  loadSettings,
  saveSettings,
  findHistoryEntry,
  type Settings,
} from './storage.js';
import {
  loadOverrides,
  patchOverride,
  clearOverride,
  publicView,
  publicCustomView,
  upsertCustomProvider,
  removeCustomProvider,
  validateCustomName,
  type CustomProviderEntry,
} from './provider-overrides.js';
import {
  listTextProviders,
  listImageProviders,
  getProviderConfig,
  isProviderConfigured,
  setProviderOverridesCache,
  setCustomProviderOverridesCache,
  setCustomProviderRegistry,
  setExternalCredentialHook,
  type CustomProviderConfig,
} from '../providers/index.js';
import {
  readXAIToken,
  getXAIStatus,
  startXAILogin,
  cancelXAILogin,
  getXAILoginProgress,
  type XAILoginProgress,
} from './openclaw-auth.js';
import type { ComicOptions, ComicResult } from '../types.js';

/** Names of the providers that the user can configure through the UI. */
const CONFIGURABLE_PROVIDERS = new Set(['openrouter', 'lmstudio', 'minimax', 'xai', 'gemini', 'comfyui']);

/**
 * Turn an arbitrary comic title into a safe, browser-friendly filename slug.
 * Used to set the Content-Disposition filename when streaming the PDF so the
 * downloaded file has a meaningful name (e.g. "the-bridge-at-sundown.pdf")
 * instead of a raw jobId.
 *
 * - Lowercase
 * - Replaces runs of non-alphanumeric chars with single hyphens
 * - Trims leading/trailing hyphens
 * - Caps at 80 chars to keep filenames sane on every OS
 * - Falls back to "comic" if the result is empty
 */
function slugifyFilename(raw: string): string {
  const slug = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || 'comic';
}

function isConfigurableProvider(name: string): boolean {
  return CONFIGURABLE_PROVIDERS.has(name);
}

/** Refresh the custom-provider caches and the live registry from disk state. */
function refreshCustomCachesAndRegistry(all: import('./provider-overrides.js').OverridesFile): void {
  const customCache: Record<string, { apiKey?: string; baseUrl?: string; model?: string }> = {};
  const customEntries: CustomProviderConfig[] = [];
  for (const [name, o] of Object.entries(all.customProviders ?? {})) {
    customCache[name] = {
      ...(o.apiKey ? { apiKey: o.apiKey } : {}),
      baseUrl: o.baseUrl,
      ...(o.model ? { model: o.model } : {}),
    };
    customEntries.push({
      name,
      baseUrl: o.baseUrl,
      ...(o.apiKey ? { apiKey: o.apiKey } : {}),
      ...(o.model ? { model: o.model } : {}),
    });
  }
  setCustomProviderOverridesCache(customCache);
  setCustomProviderRegistry(customEntries);
}

/** Bootstrap the provider-overrides cache from disk on server start. */
async function bootstrapOverridesCache(): Promise<void> {
  try {
    const all = await loadOverrides();
    // Strip the `updatedAt` field — the cache only carries the values the
    // config resolver needs (apiKey, baseUrl, model).
    const minimal: Record<string, { apiKey?: string; baseUrl?: string }> = {};
    for (const [name, o] of Object.entries(all.providers ?? {})) {
      minimal[name] = { ...(o.apiKey ? { apiKey: o.apiKey } : {}), ...(o.baseUrl ? { baseUrl: o.baseUrl } : {}) };
    }
    setProviderOverridesCache(minimal);

    const customCache: Record<string, { apiKey?: string; baseUrl?: string; model?: string }> = {};
    const customEntries: CustomProviderConfig[] = [];
    for (const [name, o] of Object.entries(all.customProviders ?? {})) {
      customCache[name] = {
        ...(o.apiKey ? { apiKey: o.apiKey } : {}),
        baseUrl: o.baseUrl,
        ...(o.model ? { model: o.model } : {}),
      };
      customEntries.push({ name, baseUrl: o.baseUrl, ...(o.apiKey ? { apiKey: o.apiKey } : {}), ...(o.model ? { model: o.model } : {}) });
    }
    setCustomProviderOverridesCache(customCache);
    setCustomProviderRegistry(customEntries);
  } catch (err) {
    console.warn(`[routes] failed to bootstrap overrides cache: ${(err as Error).message}`);
  }
}

// Fire-and-forget — the cache is filled in shortly after module load. The
// first provider call may run with an empty cache (env/openclaw.json still
// resolve cleanly), but any subsequent call sees the user's overrides.
void bootstrapOverridesCache();

// Install the openclaw-auth integration as the external credential hook.
// This means any provider whose key lives in the openclaw auth store
// (e.g. xAI's OAuth bearer token) will be picked up automatically when
// getProviderConfig() is called — no env var, no Settings page, no paste.
setExternalCredentialHook((providerName) => {
  if (providerName === 'xai') return readXAIToken();
  return undefined;
});

// ---------------------------------------------------------------------------
// Router factory — takes a Router so we can mount it under any prefix in tests.
// ---------------------------------------------------------------------------

export function buildRouter(): Router {
  const router = Router();
  const jobs = getJobManager();

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  /**
   * GET /api/health
   * → { status: 'ok', version: string, uptime: number }
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: process.uptime(),
    });
  });

  // -------------------------------------------------------------------------
  // Providers
  // -------------------------------------------------------------------------

  /** Shape returned for each provider. */
  interface ProviderInfo {
    name: string;
    available: boolean;
    model?: string;
    baseUrl?: string;
    apiStyle?: string;
    isLocal?: boolean;
    error?: string;
  }

  /**
   * Build a ProviderInfo for a single provider, by checking whether its
   * config is present and well-formed.
   */
  function describeProvider(name: string): ProviderInfo {
    if (name === 'mock') {
      return { name, available: true, model: 'mock', apiStyle: 'mock' };
    }
    const cfg = getProviderConfig(name);
    const errors: string[] = [];
    if (!cfg.baseUrl) errors.push('baseUrl missing');
    // Local providers (LM Studio) don't require an apiKey — they can be used
    // anonymously. Remote providers must have one.
    if (!cfg.isLocal && !cfg.apiKey) {
      errors.push('apiKey missing');
    }
    return {
      name,
      available: errors.length === 0 && isProviderConfigured(name),
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      apiStyle: cfg.apiStyle,
      isLocal: cfg.isLocal,
      ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
    };
  }

  /**
   * GET /api/providers
   * → { text: ProviderInfo[], image: ProviderInfo[] }
   * Includes both built-in providers and any user-defined custom endpoints.
   */
  router.get('/providers', async (_req: Request, res: Response) => {
    const { allTextProviderNames, allImageProviderNames } = await import('../providers/index.js');
    const text = allTextProviderNames().map(describeProvider);
    const image = allImageProviderNames().map(describeProvider);
    res.json({ text, image });
  });

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  /**
   * GET /api/settings
   * → Settings  (the full record, with defaults filled in)
   */
  router.get('/settings', async (_req: Request, res: Response) => {
    const s = await loadSettings();
    res.json(s);
  });

  /**
   * PUT /api/settings
   * body: Partial<Settings>
   * → Settings  (the merged record, after persistence)
   */
  router.put('/settings', async (req: Request, res: Response) => {
    const patch = (req.body ?? {}) as Partial<Settings>;
    // Validate enum-ish fields
    if (patch.defaultOutputFormat && !['pdf', 'cbz'].includes(patch.defaultOutputFormat)) {
      return res.status(400).json({ error: 'defaultOutputFormat must be "pdf" or "cbz"' });
    }
    if (patch.defaultPageCount != null) {
      const n = Number(patch.defaultPageCount);
      if (!Number.isInteger(n) || n < 1 || n > 50) {
        return res.status(400).json({ error: 'defaultPageCount must be an integer 1-50' });
      }
      patch.defaultPageCount = n;
    }
    // Validate provider names against the live registry. Without this, a
    // client could persist a name pointing at a deleted custom provider
    // and the next /api/comic call would crash with "Unknown text provider".
    const { allTextProviderNames, allImageProviderNames } = await import('../providers/index.js');
    const textNames = new Set(allTextProviderNames());
    const imageNames = new Set(allImageProviderNames());
    if (patch.defaultTextProvider != null && !textNames.has(patch.defaultTextProvider)) {
      return res.status(400).json({ error: `defaultTextProvider "${patch.defaultTextProvider}" is not a registered provider` });
    }
    if (patch.defaultImageProvider != null && !imageNames.has(patch.defaultImageProvider)) {
      return res.status(400).json({ error: `defaultImageProvider "${patch.defaultImageProvider}" is not a registered provider` });
    }
    if (patch.defaultProvider != null && !textNames.has(patch.defaultProvider) && !imageNames.has(patch.defaultProvider)) {
      return res.status(400).json({ error: `defaultProvider "${patch.defaultProvider}" is not a registered provider` });
    }
    const next = await saveSettings(patch);
    res.json(next);
  });

  // -------------------------------------------------------------------------
  // Provider overrides — user-supplied credentials (apiKey + baseUrl)
  //
  // Resolution order in providers/config.ts is env > overrides > openclaw.json
  // > built-in defaults. These routes let the user override the middle two
  // layers through the WebUI.
  // -------------------------------------------------------------------------

  /**
   * GET /api/provider-overrides
   * → { openrouter: { hasKey, keyTail, baseUrl, updatedAt, source }, ... }
   * Always returns one entry per configurable provider, with `hasKey: false`
   * when the user hasn't set anything. The full API key is NEVER returned —
   * only the last 4 chars (`keyTail`) for visual confirmation.
   */
  router.get('/provider-overrides', async (_req: Request, res: Response) => {
    try {
      const all = await loadOverrides();
      const out: Record<string, ReturnType<typeof publicView>> = {};
      for (const name of CONFIGURABLE_PROVIDERS) {
        out[name] = publicView(name, all.providers?.[name]);
      }
      res.json(out);
    } catch (err) {
      res.status(500).json({ error: `failed to load overrides: ${(err as Error).message}` });
    }
  });

  /**
   * PUT /api/provider-overrides/:name
   * body: { apiKey?: string, baseUrl?: string, clearApiKey?: boolean, clearBaseUrl?: boolean }
   * → updated public view
   *
   * To clear a field, send `clearApiKey: true` or `clearBaseUrl: true` in
   * the body. Sending an empty string for either also clears it.
   */
  router.put('/provider-overrides/:name', async (req: Request<{ name: string }>, res: Response) => {
    const { name } = req.params;
    if (!isConfigurableProvider(name)) {
      return res.status(400).json({ error: `unknown provider: ${name}` });
    }
    const body = (req.body ?? {}) as {
      apiKey?: string;
      baseUrl?: string;
      clearApiKey?: boolean;
      clearBaseUrl?: boolean;
    };

    // SSRF guard: if the user supplied a baseUrl, validate it before persisting.
    if (typeof body.baseUrl === 'string' && body.baseUrl.length > 0 && !body.clearBaseUrl) {
      const { checkProviderUrl } = await import('./url-safety.js');
      const check = checkProviderUrl(body.baseUrl);
      if (!check.ok) {
        return res.status(400).json({ error: check.error });
      }
      body.baseUrl = check.url;
    }

    // Normalize the patch to the helper's shape (null = clear).
    const patch: { apiKey?: string | null; baseUrl?: string | null } = {
      apiKey: body.clearApiKey === true ? null
        : (typeof body.apiKey === 'string' && body.apiKey.length > 0 ? body.apiKey : (body.apiKey === '' ? null : undefined)),
      baseUrl: body.clearBaseUrl === true ? null
        : (typeof body.baseUrl === 'string' && body.baseUrl.length > 0 ? body.baseUrl : (body.baseUrl === '' ? null : undefined)),
    };

    try {
      const all = await patchOverride(name, patch);
      // Refresh the in-memory cache so the next getProviderConfig() call
      // resolves through the new value without a server restart.
      const minimal: Record<string, { apiKey?: string; baseUrl?: string }> = {};
      for (const [n, o] of Object.entries(all.providers ?? {})) {
        minimal[n] = { ...(o.apiKey ? { apiKey: o.apiKey } : {}), ...(o.baseUrl ? { baseUrl: o.baseUrl } : {}) };
      }
      setProviderOverridesCache(minimal);
      res.json(publicView(name, all.providers?.[name]));
    } catch (err) {
      res.status(500).json({ error: `failed to save override: ${(err as Error).message}` });
    }
  });

  /**
   * DELETE /api/provider-overrides/:name
   * → { ok: true }
   * Removes the user's override for this provider. Subsequent calls fall
   * back to env > openclaw.json > built-in defaults.
   */
  router.delete('/provider-overrides/:name', async (req: Request<{ name: string }>, res: Response) => {
    const { name } = req.params;
    if (!isConfigurableProvider(name)) {
      return res.status(400).json({ error: `unknown provider: ${name}` });
    }
    try {
      const all = await clearOverride(name);
      const minimal: Record<string, { apiKey?: string; baseUrl?: string }> = {};
      for (const [n, o] of Object.entries(all.providers ?? {})) {
        minimal[n] = { ...(o.apiKey ? { apiKey: o.apiKey } : {}), ...(o.baseUrl ? { baseUrl: o.baseUrl } : {}) };
      }
      setProviderOverridesCache(minimal);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: `failed to clear override: ${(err as Error).message}` });
    }
  });

  /**
   * POST /api/provider-overrides/:name/test
   * → { ok: true, model?: string } | { ok: false, error: string }
   *
   * Makes a tiny "hello" call against the provider using the merged config
   * (env + overrides + openclaw.json + defaults) to confirm the credentials
   * actually work. The provider's choice of "test" call is light enough to
   * not bill much:
   *   - openrouter/lmstudio/minimax text: "ping" with maxTokens=8
   *   - openrouter/lmstudio/minimax image: 1x1 pixel, 64x64
   *
   * We always use the text probe so the same call works for both text and
   * image providers (image providers can be tested separately later).
   */
  router.post('/provider-overrides/:name/test', async (req: Request<{ name: string }>, res: Response) => {
    const { name } = req.params;
    if (!isConfigurableProvider(name)) {
      return res.status(400).json({ ok: false, error: `unknown provider: ${name}` });
    }
    try {
      const { getTextProvider } = await import('../providers/index.js');
      const provider = getTextProvider(name);
      const cfg = getProviderConfig(name);
      if (!isProviderConfigured(name)) {
        return res.status(400).json({ ok: false, error: 'provider not configured (missing apiKey or baseUrl)' });
      }
      // Use a tiny probe — should respond in <2s on a healthy connection.
      // Note: models that emit a "thinking" block before the text block (e.g.
      // anthropic-messages) need enough tokens for both. 200 is plenty.
      const reply = await provider.complete('Reply with the single word: pong', {
        maxTokens: 200,
        temperature: 0,
        model: cfg.model,
      });
      res.json({ ok: true, sample: String(reply).slice(0, 100), model: cfg.model });
    } catch (err) {
      res.status(502).json({ ok: false, error: (err as Error).message.slice(0, 500) });
    }
  });

  // -------------------------------------------------------------------------
  // Custom OpenAI-compatible providers — user-defined endpoints
  // -------------------------------------------------------------------------

  /**
   * GET /api/custom-providers
   * → { "<name>": { name, baseUrl, hasKey, keyTail?, model?, updatedAt? }, ... }
   */
  router.get('/custom-providers', async (_req: Request, res: Response) => {
    try {
      const all = await loadOverrides();
      const out: Record<string, ReturnType<typeof publicCustomView>> = {};
      for (const [name, entry] of Object.entries(all.customProviders ?? {})) {
        out[name] = publicCustomView(entry);
      }
      res.json(out);
    } catch (err) {
      res.status(500).json({ error: `failed to load custom providers: ${(err as Error).message}` });
    }
  });

  /**
   * POST /api/custom-providers
   * body: { name: string, baseUrl: string, apiKey?: string, model?: string }
   * → PublicCustomView
   *
   * Validates the name (non-empty, no reserved built-in names, valid charset),
   * stores the entry, rebuilds the custom-provider registry, and returns the
   * public view (key masked to last 4).
   */
  router.post('/custom-providers', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Partial<CustomProviderEntry>;
    const v = validateCustomName(body.name ?? '');
    if (!v.ok) {
      return res.status(400).json({ error: v.error });
    }
    if (!body.baseUrl || typeof body.baseUrl !== 'string') {
      return res.status(400).json({ error: 'baseUrl is required' });
    }
    // SSRF guard: reject URLs that point at private/loopback addresses unless
    // the server is explicitly configured to allow them.
    const { checkProviderUrl } = await import('./url-safety.js');
    const check = checkProviderUrl(body.baseUrl);
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }
    try {
      const all = await upsertCustomProvider({
        name: v.name,
        baseUrl: check.url ?? body.baseUrl,
        ...(typeof body.apiKey === 'string' && body.apiKey.length > 0 ? { apiKey: body.apiKey } : {}),
        ...(typeof body.model === 'string' && body.model.length > 0 ? { model: body.model } : {}),
      });
      // Refresh both caches and the registry.
      refreshCustomCachesAndRegistry(all);
      res.json(publicCustomView(all.customProviders?.[v.name]));
    } catch (err) {
      res.status(500).json({ error: `failed to add custom provider: ${(err as Error).message}` });
    }
  });

  /**
   * PATCH /api/custom-providers/:name
   * body: { baseUrl?, apiKey?, model?, clearApiKey?, clearModel? }
   * → PublicCustomView
   *
   * Updates a single field on an existing custom provider. To clear apiKey
   * or model, send `clearApiKey: true` or `clearModel: true` respectively.
   */
  router.patch('/custom-providers/:name', async (req: Request<{ name: string }>, res: Response) => {
    const { name } = req.params;
    const all = await loadOverrides();
    const existing = all.customProviders?.[name];
    if (!existing) {
      return res.status(404).json({ error: `custom provider not found: ${name}` });
    }
    const body = (req.body ?? {}) as Partial<CustomProviderEntry> & {
      clearApiKey?: boolean;
      clearModel?: boolean;
    };
    let nextBaseUrl = existing.baseUrl;
    if (typeof body.baseUrl === 'string' && body.baseUrl.length > 0) {
      const { checkProviderUrl } = await import('./url-safety.js');
      const check = checkProviderUrl(body.baseUrl);
      if (!check.ok) {
        return res.status(400).json({ error: check.error });
      }
      nextBaseUrl = check.url ?? body.baseUrl;
    }
    const updated: CustomProviderEntry = {
      name: existing.name,
      baseUrl: nextBaseUrl,
      updatedAt: new Date().toISOString(),
    };
    // apiKey: null out if clearApiKey, else keep/use the new one
    if (body.clearApiKey === true) {
      // don't set apiKey
    } else if (typeof body.apiKey === 'string' && body.apiKey.length > 0) {
      updated.apiKey = body.apiKey;
    } else if (existing.apiKey) {
      updated.apiKey = existing.apiKey;
    }
    // model
    if (body.clearModel === true) {
      // don't set model
    } else if (typeof body.model === 'string' && body.model.length > 0) {
      updated.model = body.model;
    } else if (existing.model) {
      updated.model = existing.model;
    }
    try {
      const next = await upsertCustomProvider(updated);
      refreshCustomCachesAndRegistry(next);
      res.json(publicCustomView(next.customProviders?.[name]));
    } catch (err) {
      res.status(500).json({ error: `failed to update custom provider: ${(err as Error).message}` });
    }
  });

  /**
   * DELETE /api/custom-providers/:name
   * → { ok: true }
   */
  router.delete('/custom-providers/:name', async (req: Request<{ name: string }>, res: Response) => {
    const { name } = req.params;
    try {
      const all = await removeCustomProvider(name);
      refreshCustomCachesAndRegistry(all);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: `failed to remove custom provider: ${(err as Error).message}` });
    }
  });

  /**
   * POST /api/custom-providers/:name/test
   * → { ok: true, sample, model } | { ok: false, error }
   */
  router.post('/custom-providers/:name/test', async (req: Request<{ name: string }>, res: Response) => {
    const { name } = req.params;
    try {
      const { getTextProvider, allTextProviderNames } = await import('../providers/index.js');
      if (!allTextProviderNames().includes(name)) {
        return res.status(404).json({ ok: false, error: `custom provider not registered: ${name}` });
      }
      const provider = getTextProvider(name);
      const cfg = getProviderConfig(name);
      const reply = await provider.complete('Reply with the single word: pong', {
        maxTokens: 200,
        temperature: 0,
        model: cfg.model,
      });
      res.json({ ok: true, sample: String(reply).slice(0, 100), model: cfg.model });
    } catch (err) {
      res.status(502).json({ ok: false, error: (err as Error).message.slice(0, 500) });
    }
  });

  // -------------------------------------------------------------------------
  // xAI sign-in via openclaw device flow
  //
  // These routes let the WebUI trigger the openclaw OAuth device flow
  // for xAI without the user leaving the app. The flow:
  //   1. UI calls POST /api/auth/xai/sign-in
  //   2. Server spawns `openclaw models auth login --device-code
  //      --provider=xai` and captures the device URL from stdout
  //   3. UI polls GET /api/auth/xai/status until the login completes
  //      (or the user cancels)
  //   4. On success, the openclaw auth store has a fresh xAI token
  //      which the provider picks up automatically (via the external
  //      credential hook installed in bootstrap).
  // -------------------------------------------------------------------------

  /**
   * GET /api/auth/xai/status
   * Returns the current sign-in status (signedIn, email, expires, source)
   * and, if a device-flow login is in flight, the device URL.
   */
  router.get('/auth/xai/status', (_req: Request, res: Response) => {
    res.json({
      ...getXAIStatus(),
      login: getXAILoginProgress(),
    });
  });

  /**
   * POST /api/auth/xai/sign-in
   * Starts the openclaw device-flow login for xAI. Returns
   * immediately; the caller polls /api/auth/xai/status for progress.
   */
  router.post('/auth/xai/sign-in', (_req: Request, res: Response) => {
    const result = startXAILogin();
    if (!result.started) {
      return res.status(409).json({ ok: false, error: result.reason });
    }
    res.json({ ok: true });
  });

  /**
   * POST /api/auth/xai/sign-in/cancel
   * Stops the in-flight device-flow login.
   */
  router.post('/auth/xai/sign-in/cancel', (_req: Request, res: Response) => {
    cancelXAILogin();
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Comic — create, poll, regenerate
  // -------------------------------------------------------------------------

  /**
   * POST /api/comic
   * body: { story: string, options?: Partial<ComicOptions> }
   * → { jobId: string }
   *
   * Kicks off createComic() asynchronously. The jobId can be polled via
   * GET /api/comic/:jobId.
   */
  router.post('/comic', async (req: Request, res: Response) => {
    const { story, options } = (req.body ?? {}) as {
      story?: string;
      options?: ComicOptions;
    };
    if (!story || typeof story !== 'string' || story.trim().length === 0) {
      return res.status(400).json({ error: 'story is required and must be a non-empty string' });
    }
    if (story.length > 8000) {
      return res.status(400).json({ error: 'story is too long (max 8000 chars)' });
    }

    // Strip server-controlled fields from `options` so a hostile client
    // can't pick an output directory, override provider names with arbitrary
    // strings, or pass unbounded numeric options.
    const safeOptions: Partial<ComicOptions> = {};
    if (options) {
      if (typeof options.artStyle === 'string' && options.artStyle.length > 0 && options.artStyle.length < 64) {
        safeOptions.artStyle = options.artStyle;
      }
      if (Number.isInteger(options.pageCount) && (options.pageCount as number) >= 1 && (options.pageCount as number) <= 50) {
        safeOptions.pageCount = options.pageCount;
      }
      if (Number.isInteger(options.panelsPerPage) && (options.panelsPerPage as number) >= 1 && (options.panelsPerPage as number) <= 12) {
        safeOptions.panelsPerPage = options.panelsPerPage;
      }
      if (options.outputProfile != null) {
        if (
          options.outputProfile !== 'comic-print' &&
          options.outputProfile !== 'digital-portrait' &&
          options.outputProfile !== 'storyboard-widescreen'
        ) {
          return res.status(400).json({ error: 'outputProfile must be "comic-print", "digital-portrait", or "storyboard-widescreen"' });
        }
        safeOptions.outputProfile = options.outputProfile;
      }
      if (options.outputFormat === 'pdf' || options.outputFormat === 'cbz') {
        safeOptions.outputFormat = options.outputFormat;
      }
      // Model overrides — free-text strings, but bounded to 128 chars
      // and stripped of control chars so a client can't smuggle HTML or
      // break the request to the upstream provider.
      const cleanModel = (raw: unknown): string | undefined => {
        if (typeof raw !== 'string') return undefined;
        const trimmed = raw.trim();
        if (trimmed.length === 0) return undefined;
        if (trimmed.length > 128) return undefined;
        if (/[\x00-\x1f\x7f]/.test(trimmed)) return undefined;
        return trimmed;
      };
      const imgModel = cleanModel(options.imageModel);
      if (options.imageModel != null && imgModel === undefined && typeof options.imageModel === 'string' && options.imageModel.length > 0) {
        return res.status(400).json({ error: 'imageModel must be a non-empty string of at most 128 characters' });
      }
      if (imgModel) safeOptions.imageModel = imgModel;
      const txtModel = cleanModel(options.textModel);
      if (options.textModel != null && txtModel === undefined && typeof options.textModel === 'string' && options.textModel.length > 0) {
        return res.status(400).json({ error: 'textModel must be a non-empty string of at most 128 characters' });
      }
      if (txtModel) safeOptions.textModel = txtModel;
      // Validate provider names against the live registry (built-in + custom).
      // ESM import — top-of-file import is fine; this is a small per-request
      // cost. Lazy-load the registry functions here.
      const { allTextProviderNames, allImageProviderNames } = await import('../providers/index.js');
      const textNames = new Set(allTextProviderNames());
      const imageNames = new Set(allImageProviderNames());
      if (options.textProvider != null) {
        if (typeof options.textProvider !== 'string' || (!textNames.has(options.textProvider) && !imageNames.has(options.textProvider))) {
          return res.status(400).json({ error: `textProvider "${options.textProvider}" is not a registered provider` });
        }
        safeOptions.textProvider = options.textProvider;
      }
      if (options.imageProvider != null) {
        if (typeof options.imageProvider !== 'string' || (!textNames.has(options.imageProvider) && !imageNames.has(options.imageProvider))) {
          return res.status(400).json({ error: `imageProvider "${options.imageProvider}" is not a registered provider` });
        }
        safeOptions.imageProvider = options.imageProvider;
      }
      if (Number.isInteger(options.seed)) {
        safeOptions.seed = options.seed as number;
      }
      // Image-generation extras: aspect ratio, prompt optimizer, watermark.
      if (options.imageAspectRatio != null) {
        if (typeof options.imageAspectRatio !== 'string' || !/^\d+:\d+$/.test(options.imageAspectRatio)) {
          return res.status(400).json({ error: 'imageAspectRatio must be a string in the form "W:H" (e.g. "16:9", "1:1")' });
        }
        safeOptions.imageAspectRatio = options.imageAspectRatio;
      }
      if (options.imagePromptOptimizer != null) {
        if (typeof options.imagePromptOptimizer !== 'boolean') {
          return res.status(400).json({ error: 'imagePromptOptimizer must be a boolean' });
        }
        if (options.imagePromptOptimizer === true) safeOptions.imagePromptOptimizer = true;
      }
      if (options.imageAigcWatermark != null) {
        if (typeof options.imageAigcWatermark !== 'boolean') {
          return res.status(400).json({ error: 'imageAigcWatermark must be a boolean' });
        }
        if (options.imageAigcWatermark === true) safeOptions.imageAigcWatermark = true;
      }
      // NOTE: `outputPath` is intentionally NOT honored — the server picks
      // the output location under its own state directory. A client-supplied
      // path would let a caller write a multi-MB PDF anywhere the server
      // process has write access to.
    }

    const record = jobs.createAndStart({ story: story.trim(), options: safeOptions });
    res.status(202).json({ jobId: record.jobId });
  });

  /**
   * GET /api/comic/:jobId
   * → { status: 'pending' | 'done' | 'error', result?: ComicResult, error?: string }
   */
  router.get('/comic/:jobId', async (req: Request<{ jobId: string }>, res: Response) => {
    const jobId = req.params.jobId;
    const record = await jobs.resolve(jobId);
    if (!record) {
      return res.status(404).json({ error: `job ${jobId} not found` });
    }
    const body: {
      status: JobStatus;
      createdAt: string;
      updatedAt: string;
      result?: ComicResult;
      error?: string;
      fromHistory?: boolean;
    } = {
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    if (record.status === 'done' && record.result) body.result = record.result;
    if (record.status === 'error' && record.error) body.error = record.error;
    if (record.fromHistory) body.fromHistory = true;
    res.json(body);
  });

  /**
   * GET /api/comic/:jobId/pdf
   * Streams the generated PDF binary in 64 KB chunks so a 200-page comic
   * doesn't have to be loaded entirely into V8 heap.
   * Headers: Content-Type: application/pdf
   */
  router.get('/comic/:jobId/pdf', async (req: Request<{ jobId: string }>, res: Response) => {
    const jobId = req.params.jobId;
    const record = await jobs.resolve(jobId);
    if (!record) {
      return res.status(404).json({ error: `job ${jobId} not found` });
    }
    if (record.status !== 'done' || !record.result) {
      return res
        .status(409)
        .json({ error: `job ${jobId} not done (status: ${record.status})` });
    }
    // Prefer the explicitly pre-rendered PDF (created at job time so
    // the user can always download it). Fall back to the legacy
    // outputPath field for old jobs that pre-date the dual-format field.
    const path = record.result.pdfPath ?? record.result.outputPath;
    if (!path || !existsSync(path)) {
      return res.status(410).json({ error: `output file no longer on disk` });
    }
    const size = statSync(path).size;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    // Use the comic's title as the filename (sanitized) so the downloaded
    // file has a meaningful name. `attachment` triggers the browser's
    // Save-As dialog instead of trying to render inline. Fall back to
    // the jobId if the title is missing or unsafe.
    const titleSlug = slugifyFilename(record.result.script?.title ?? record.jobId);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${titleSlug}.pdf"`
    );
    // Stream the file in 64 KB chunks. createReadStream handles backpressure
    // via the 'drain' event implicitly through pipe().
    const { createReadStream } = await import('node:fs');
    const stream = createReadStream(path, { highWaterMark: 64 * 1024 });
    stream.on('error', (err) => {
      // Client may have disconnected mid-stream. The file isn't corrupted.
      console.warn(`[pdf stream] error streaming ${path}: ${err.message}`);
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    stream.pipe(res);
  });

  /**
   * GET /api/comic/:jobId/cbz — streams the CBZ (zipped panel images) for
   * the comic. Same shape as /pdf but with .cbz extension and
   * application/vnd.comicbook+zip (or application/zip — comic readers
   * accept both). Always present since the server pre-renders both
   * formats at job completion time.
   */
  router.get('/comic/:jobId/cbz', async (req: Request<{ jobId: string }>, res: Response) => {
    const jobId = req.params.jobId;
    const record = await jobs.resolve(jobId);
    if (!record) {
      return res.status(404).json({ error: `job ${jobId} not found` });
    }
    if (record.status !== 'done' || !record.result) {
      return res
        .status(409)
        .json({ error: `job ${jobId} not done (status: ${record.status})` });
    }
    if (!record.result.cbzPath || !existsSync(record.result.cbzPath)) {
      return res.status(410).json({ error: 'CBZ is not available for this comic' });
    }
    const path = record.result.cbzPath;
    const size = statSync(path).size;
    const titleSlug = slugifyFilename(record.result.script?.title ?? record.jobId);
    res.setHeader('Content-Type', 'application/vnd.comicbook+zip');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${titleSlug}.cbz"`
    );
    const { createReadStream } = await import('node:fs');
    const stream = createReadStream(path, { highWaterMark: 64 * 1024 });
    stream.on('error', (err) => {
      console.warn(`[cbz stream] error streaming ${path}: ${err.message}`);
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    stream.pipe(res);
  });

  /**
   * GET /api/comic/:jobId/images/:panelId
   * Returns a single panel PNG.
   * Headers: Content-Type: image/png
   *
   * The panel image is read from the `images/` directory next to the PDF
   * (createComic() writes one PNG per panel there).
   */
  router.get('/comic/:jobId/images/:panelId', async (req: Request<{ jobId: string; panelId: string }>, res: Response) => {
    const jobId = req.params.jobId;
    const record = await jobs.resolve(jobId);
    if (!record) {
      return res.status(404).json({ error: `job ${jobId} not found` });
    }
    if (record.status !== 'done' || !record.result) {
      return res
        .status(409)
        .json({ error: `job ${jobId} not done (status: ${record.status})` });
    }
    const panelId = req.params.panelId;
    // Reject anything that smells like a path traversal.
    if (panelId.includes('..') || panelId.includes('/') || panelId.includes('\\')) {
      return res.status(400).json({ error: 'invalid panelId' });
    }
    // Try PNG first, then JPEG. Different providers return different formats —
    // we keep what came back from the provider and serve with the matching mime.
    // Per-job images dir (sibling to the PDF, named after the PDF stem).
    // We try both shapes for backward compat with older comics that used
    // `<parent>/images/`.
    const stem = record.result.outputPath.replace(/\.[^./\\]+$/, '');
    const perJobDir = `${stem}.images`;
    const legacyDir = join(dirname(record.result.outputPath), 'images');
    const pngPerJob = join(perJobDir, `${panelId}.png`);
    const pngLegacy = join(legacyDir, `${panelId}.png`);
    const jpgPerJob = join(perJobDir, `${panelId}.jpg`);
    const jpgLegacy = join(legacyDir, `${panelId}.jpg`);
    const pngPath = existsSync(pngPerJob) ? pngPerJob : existsSync(pngLegacy) ? pngLegacy : null;
    const jpgPath = existsSync(jpgPerJob) ? jpgPerJob : existsSync(jpgLegacy) ? jpgLegacy : null;
    const imagePath = pngPath ?? jpgPath;
    if (!imagePath) {
      return res.status(404).json({ error: `panel image not found: ${panelId}` });
    }
    const size = statSync(imagePath).size;
    const mime = imagePath.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buf = await readFile(imagePath);
    res.end(buf);
  });

  /**
   * GET /api/comic/:jobId/agent-guidance
   * Returns the generated markdown handoff for Hermes/OpenClaw/external agents.
   * Headers: Content-Type: text/markdown
   */
  router.get('/comic/:jobId/agent-guidance', async (req: Request<{ jobId: string }>, res: Response) => {
    const jobId = req.params.jobId;
    const record = await jobs.resolve(jobId);
    if (!record) {
      return res.status(404).json({ error: `job ${jobId} not found` });
    }
    if (record.status !== 'done' || !record.result) {
      return res
        .status(409)
        .json({ error: `job ${jobId} not done (status: ${record.status})` });
    }
    const guidancePath = record.result.agentGuidancePath;
    if (!guidancePath || !existsSync(guidancePath)) {
      return res.status(404).json({ error: 'no agent guidance for this comic' });
    }
    const size = statSync(guidancePath).size;
    const titleSlug = slugifyFilename(record.result.script?.title ?? record.jobId);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${titleSlug}-agent-guidance.md"`
    );
    const buf = await readFile(guidancePath, 'utf8');
    res.end(buf);
  });

  /**
   * GET /api/comic/:jobId/song-sheet
   * Returns the generated song sheet markdown.
   * Headers: Content-Type: text/markdown
   */
  router.get('/comic/:jobId/song-sheet', async (req: Request<{ jobId: string }>, res: Response) => {
    const jobId = req.params.jobId;
    const record = await jobs.resolve(jobId);
    if (!record) {
      return res.status(404).json({ error: `job ${jobId} not found` });
    }
    if (record.status !== 'done' || !record.result) {
      return res
        .status(409)
        .json({ error: `job ${jobId} not done (status: ${record.status})` });
    }
    const songSheetPath = record.result.songSheetPath;
    if (!songSheetPath || !existsSync(songSheetPath)) {
      return res.status(404).json({ error: 'no song sheet for this comic' });
    }
    const size = statSync(songSheetPath).size;
    const titleSlug = slugifyFilename(record.result.script?.title ?? record.jobId);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', `attachment; filename="${titleSlug}-song-sheet.md"`);
    const buf = await readFile(songSheetPath, 'utf8');
    res.end(buf);
  });

  /**
   * GET /api/comic/:jobId/theme-audio
   * Returns the generated mock theme WAV.
   * Headers: Content-Type: audio/wav
   */
  router.get('/comic/:jobId/theme-audio', async (req: Request<{ jobId: string }>, res: Response) => {
    const jobId = req.params.jobId;
    const record = await jobs.resolve(jobId);
    if (!record) {
      return res.status(404).json({ error: `job ${jobId} not found` });
    }
    if (record.status !== 'done' || !record.result) {
      return res
        .status(409)
        .json({ error: `job ${jobId} not done (status: ${record.status})` });
    }
    const songAudioPath = record.result.songAudioPath;
    if (!songAudioPath || !existsSync(songAudioPath)) {
      return res.status(404).json({ error: 'no theme audio for this comic' });
    }
    const size = statSync(songAudioPath).size;
    const titleSlug = slugifyFilename(record.result.script?.title ?? record.jobId);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', `attachment; filename="${titleSlug}-theme.wav"`);
    const buf = await readFile(songAudioPath);
    res.end(buf);
  });

  /**
   * GET /api/comic/:jobId/cover
   * Returns the cover/title-page image if one was generated.
   * Headers: Content-Type: image/png or image/jpeg
   */
  router.get('/comic/:jobId/cover', async (req: Request<{ jobId: string }>, res: Response) => {
    const jobId = req.params.jobId;
    const record = await jobs.resolve(jobId);
    if (!record) {
      return res.status(404).json({ error: `job ${jobId} not found` });
    }
    if (record.status !== 'done' || !record.result) {
      return res
        .status(409)
        .json({ error: `job ${jobId} not done (status: ${record.status})` });
    }
    const coverPath = record.result.coverImagePath;
    if (!coverPath || !existsSync(coverPath)) {
      return res.status(404).json({ error: 'no cover image for this comic' });
    }
    const size = statSync(coverPath).size;
    const mime = coverPath.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buf = await readFile(coverPath);
    res.end(buf);
  });

  /**
   * POST /api/comic/:jobId/regenerate
   * body: { options?: Partial<ComicOptions> }
   * → { jobId: string }  (the new jobId)
   *
   * Re-runs createComic() with the same story and the new options merged
   * on top of the previous ones. The new job has a fresh jobId.
   */
  router.post('/comic/:jobId/regenerate', (req: Request<{ jobId: string }>, res: Response) => {
    const jobId = req.params.jobId;
    const record = jobs.get(jobId);
    if (!record) {
      return res.status(404).json({ error: `job ${jobId} not found` });
    }
    const body = (req.body ?? {}) as { options?: ComicOptions };
    const merged: ComicOptions = { ...record.options, ...(body.options ?? {}) };
    const next = jobs.createAndStart({ story: record.story, options: merged });
    res.status(202).json({ jobId: next.jobId });
  });

  /**
   * DELETE /api/comic/:jobId
   * Cancels an in-flight job and removes its in-memory record. Persisted
   * history entries are kept (the user can still see what was attempted).
   * → { ok: true } | { ok: false, error }
   */
  router.delete('/comic/:jobId', (req: Request<{ jobId: string }>, res: Response) => {
    const jobId = req.params.jobId;
    const record = jobs.get(jobId);
    if (!record) {
      return res.status(404).json({ ok: false, error: `job ${jobId} not found` });
    }
    if (record.status === 'pending') {
      jobs.cancel(jobId);
    }
    jobs.delete(jobId);
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

  /**
   * GET /api/history
   * → HistoryEntry[]  (most recent first, max 50)
   *
   * Each entry is a slim shape: { jobId, title, createdAt, artStyle,
   * pageCount, outputPath, scriptJson }. The frontend should not assume
   * any particular order beyond "newest first".
   */
  router.get('/history', async (_req: Request, res: Response) => {
    const list = await loadHistory();
    // Cap at 20 for the initial page load; history.json itself keeps 50.
    res.json(list.slice(0, 20));
  });

  /**
   * DELETE /api/history/:jobId
   * → 204 on success
   *
   * Removes the entry from history.json. Does NOT touch the on-disk PDF
   * or the in-memory job record (so an in-flight regeneration isn't lost).
   */
  router.delete('/history/:jobId', async (req: Request<{ jobId: string }>, res: Response) => {
    const jobId = req.params.jobId;
    const removed = await removeHistoryEntry(jobId);
    if (!removed) {
      return res.status(404).json({ error: `history entry ${jobId} not found` });
    }
    res.status(204).end();
  });

  return router;
}
