/**
 * comic-creator — provider config loader.
 *
 * Reads `~/.openclaw/openclaw.json` and standard env vars to resolve
 * API keys, base URLs, and default model names for every provider.
 *
 * Resolution order (highest first):
 *   1. process.env (e.g. OPENROUTER_API_KEY, MINIMAX_API_KEY)
 *   2. openclaw.json -> models.providers.<name>.{apiKey, baseUrl, models}
 *   3. Built-in defaults (LM Studio's local URL, OpenRouter's public URL, etc.)
 *
 * This module is read-only — it never writes back to openclaw.json.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface ProviderConfig {
  /** API key. May be undefined for local providers (LM Studio). */
  apiKey?: string;
  /** Base URL for the provider's chat-completions endpoint. */
  baseUrl?: string;
  /** Default model id to use if the caller doesn't specify one. */
  model?: string;
  /** Auth mode declared in openclaw.json, e.g. "api_key" or "oauth". */
  authMode?: string;
  /** API surface declared in openclaw.json (e.g. "openai-responses" or "anthropic-messages"). */
  apiStyle?: 'openai-responses' | 'anthropic-messages' | string;
  /** True when the configured baseUrl is loopback (LM Studio etc.). */
  isLocal?: boolean;
  /** Original raw record from openclaw.json for advanced consumers. */
  raw?: Record<string, unknown>;
}

interface OpenClawConfig {
  models?: {
    providers?: Record<string, OpenClawProviderEntry>;
  };
  auth?: {
    profiles?: Record<string, { provider?: string; mode?: string }>;
  };
}

interface OpenClawProviderEntry {
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  auth?: string;
  models?: Array<{ id: string; name?: string }>;
  [k: string]: unknown;
}

/** Mapping from our short provider name → lookup keys used in openclaw.json. */
const PROVIDER_ALIASES: Record<string, string[]> = {
  openrouter: ['openrouter', 'openrouter:default'],
  lmstudio: ['lmstudio', 'lmstudio:default'],
  minimax: ['minimax-portal', 'minimax-portal:default', 'minimax'],
  xai: ['xai', 'xai:default', 'grok'],
  gemini: ['gemini', 'gemini:default', 'google', 'google-genai'],
  comfyui: ['comfyui', 'comfyui:default'],
};

const ENV_API_KEY: Record<string, string[]> = {
  openrouter: ['OPENROUTER_API_KEY'],
  lmstudio: ['LMSTUDIO_API_KEY', 'LM_STUDIO_API_KEY'],
  minimax: ['MINIMAX_API_KEY', 'MINIMAX_API_KEY'],
  xai: ['XAI_API_KEY', 'GROK_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  comfyui: ['COMFYUI_API_KEY'],
};

const ENV_BASE_URL: Record<string, string[]> = {
  openrouter: ['OPENROUTER_BASE_URL'],
  lmstudio: ['LMSTUDIO_BASE_URL', 'LM_STUDIO_BASE_URL'],
  minimax: ['MINIMAX_BASE_URL', 'MINIMAX_BASE_URL'],
  xai: ['XAI_BASE_URL'],
  gemini: ['GEMINI_BASE_URL', 'GOOGLE_BASE_URL'],
  comfyui: ['COMFYUI_BASE_URL'],
};

const ENV_MODEL: Record<string, string[]> = {
  openrouter: ['OPENROUTER_MODEL'],
  lmstudio: ['LMSTUDIO_MODEL'],
  minimax: ['MINIMAX_MODEL'],
  xai: ['XAI_MODEL', 'GROK_MODEL'],
  gemini: ['GEMINI_MODEL', 'GOOGLE_MODEL'],
  comfyui: ['COMFYUI_MODEL'],
};

const BUILTIN_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/auto',
  },
  lmstudio: {
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'qwen3.6-27b',
  },
  minimax: {
    baseUrl: 'https://api.minimax.io/v1',
    model: 'minimax/minimax',
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-2-latest',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.0-flash',
  },
  comfyui: {
    baseUrl: 'http://127.0.0.1:8188/v1',
    model: 'comfyui-default',
  },
};

let _cachedConfig: OpenClawConfig | null = null;

/** Read and cache the openclaw.json config file. Returns {} on any error. */
function loadOpenClawConfig(): OpenClawConfig {
  if (_cachedConfig) return _cachedConfig;
  const configPath = join(homedir(), '.openclaw', 'openclaw.json');
  if (!existsSync(configPath)) {
    _cachedConfig = {};
    return _cachedConfig;
  }
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as OpenClawConfig;
    _cachedConfig = parsed ?? {};
    return _cachedConfig;
  } catch (err) {
    // Don't crash the whole skill just because openclaw.json is malformed —
    // fall back to env vars and built-in defaults.
    console.warn(
      `[providers/config] failed to parse ${configPath}: ${(err as Error).message}. Falling back to env + defaults.`
    );
    _cachedConfig = {};
    return _cachedConfig;
  }
}

/** Reset the cached config (test helper). */
export function _resetConfigCache(): void {
  _cachedConfig = null;
}

function firstFromEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function findProviderEntry(name: string): OpenClawProviderEntry | undefined {
  const config = loadOpenClawConfig();
  const providers = config.models?.providers ?? {};
  const aliases = PROVIDER_ALIASES[name] ?? [name];
  for (const alias of aliases) {
    if (providers[alias]) return providers[alias];
  }
  return undefined;
}

function isLocalBaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i.test(url);
}

function detectApiStyle(baseUrl: string | undefined, entry: OpenClawProviderEntry | undefined): ProviderConfig['apiStyle'] {
  // 1. Explicit declaration wins.
  if (typeof entry?.api === 'string') return entry.api;
  // 2. URL-based heuristic: "/anthropic/" in the path means Anthropic Messages API.
  if (baseUrl && /\/anthropic\/?/i.test(baseUrl)) return 'anthropic-messages';
  return 'openai-responses';
}

/**
 * Resolve config for a provider.
 *
 * @param name - one of "openrouter" | "lmstudio" | "minimax" | "mock"
 *               (the provider registry also has a "mock" entry but it has no config)
 *
 * Resolution order (highest first):
 *   1. process.env (e.g. OPENROUTER_API_KEY, MINIMAX_API_KEY)
 *   2. provider-overrides (user-supplied via the WebUI Settings page)
 *   3. openclaw.json -> models.providers.<name>.{apiKey, baseUrl, models}
 *   4. Built-in defaults (LM Studio's local URL, OpenRouter's public URL, etc.)
 */
/** Read the cached overrides for a custom provider (returns undefined if
 *  the user hasn't defined one with that name). */
function findCustomOverride(name: string): { apiKey?: string; baseUrl?: string; model?: string } | undefined {
  const cache = _customProviderOverridesCache[name];
  if (!cache) return undefined;
  return cache;
}

/** Pluggable external credential lookup. Allows server-side modules
 *  (e.g. the openclaw-auth integration) to inject API keys for built-in
 *  providers without hard-coding the openclaw dependency in this file.
 *
 *  The hook returns `undefined` if no external credential is available.
 *  The resolver tries the env first, then the external hook, then
 *  openclaw.json — so the hook is the second-highest priority source. */
let _externalCredentialHook:
  | ((providerName: string) => string | undefined)
  | null = null;

export function setExternalCredentialHook(
  hook: ((providerName: string) => string | undefined) | null
): void {
  _externalCredentialHook = hook;
}

function readExternalCredential(name: string): string | undefined {
  return _externalCredentialHook ? _externalCredentialHook(name) : undefined;
}

export function getProviderConfig(name: string): ProviderConfig {
  if (name === 'mock') {
    return { apiKey: undefined, baseUrl: undefined, model: undefined };
  }

  const envKeys = ENV_API_KEY[name] ?? [];
  const envBaseKeys = ENV_BASE_URL[name] ?? [];
  const envModelKeys = ENV_MODEL[name] ?? [];
  const defaults = BUILTIN_DEFAULTS[name];

  // 1. Env vars win.
  let apiKey: string | undefined;
  for (const k of envKeys) {
    const v = firstFromEnv(k);
    if (v) {
      apiKey = v;
      break;
    }
  }

  let baseUrl: string | undefined;
  for (const k of envBaseKeys) {
    const v = firstFromEnv(k);
    if (v) {
      baseUrl = v;
      break;
    }
  }

  let model: string | undefined;
  for (const k of envModelKeys) {
    const v = firstFromEnv(k);
    if (v) {
      model = v;
      break;
    }
  }

  // 2. External credential hook (e.g. the openclaw-auth integration that
  //    injects the user's xAI OAuth token from their openclaw auth
  //    profile). Only fills the apiKey — model and baseUrl still come
  //    from env / openclaw.json / defaults.
  if (!apiKey) {
    const ext = readExternalCredential(name);
    if (ext && ext.length > 0) apiKey = ext;
  }

  // 3. Per-user provider-overrides (state/provider-overrides.json) fill in any
  //    field the env didn't already supply. Loaded synchronously via the cache
  //    populated by the server's routes — when the user updates an override
  //    through the UI, the route calls invalidateProviderConfigCache() so the
  //    next getProviderConfig() call sees the change.
  const override = _providerOverridesCache[name];
  if (override) {
    if (!apiKey && typeof override.apiKey === 'string' && override.apiKey.length > 0) {
      apiKey = override.apiKey;
    }
    if (!baseUrl && typeof override.baseUrl === 'string' && override.baseUrl.length > 0) {
      baseUrl = override.baseUrl;
    }
  }

  // 3. openclaw.json fills in any missing pieces.
  const entry = findProviderEntry(name);
  if (entry) {
    if (!apiKey && typeof entry.apiKey === 'string' && entry.apiKey.length > 0) {
      apiKey = entry.apiKey;
    }
    if (!baseUrl && typeof entry.baseUrl === 'string') {
      baseUrl = entry.baseUrl;
    }
    if (!model && Array.isArray(entry.models) && entry.models.length > 0) {
      const first = entry.models[0];
      if (first && typeof first.id === 'string') {
        model = first.id;
      }
    }
  }

  // 4. Built-in defaults cover the rest.
  if (!baseUrl && defaults) baseUrl = defaults.baseUrl;
  if (!model && defaults) model = defaults.model;

  // 5. Custom-provider overrides (the user added an OpenAI-compat endpoint
  //    through the WebUI). For unknown names this returns undefined and
  //    the rest of the resolver is a no-op.
  if (!isBuiltInProvider(name)) {
    const custom = findCustomOverride(name);
    if (custom) {
      if (!apiKey && custom.apiKey) apiKey = custom.apiKey;
      if (!baseUrl && custom.baseUrl) baseUrl = custom.baseUrl;
      if (!model && custom.model) model = custom.model;
    }
  }

  return {
    apiKey,
    baseUrl,
    model,
    authMode: entry?.auth,
    apiStyle: detectApiStyle(baseUrl, entry),
    isLocal: isLocalBaseUrl(baseUrl),
    raw: entry,
  };
}

const BUILT_IN_PROVIDERS = new Set(['mock', 'openrouter', 'lmstudio', 'minimax', 'xai', 'gemini', 'comfyui']);
function isBuiltInProvider(name: string): boolean {
  return BUILT_IN_PROVIDERS.has(name);
}

/** In-memory cache of built-in provider overrides, populated by the server's
 *  routes and read synchronously by `getProviderConfig()`. The server
 *  calls `setProviderOverridesCache()` when the user updates the UI. */
let _providerOverridesCache: Record<string, { apiKey?: string; baseUrl?: string }> = {};

/** In-memory cache of custom-provider overrides (per-endpoint), same shape. */
let _customProviderOverridesCache: Record<string, { apiKey?: string; baseUrl?: string; model?: string }> = {};

/** Replace the built-in override cache. Called by the server after the
 *  user updates the file. Pass `{}` to clear. */
export function setProviderOverridesCache(overrides: Record<string, { apiKey?: string; baseUrl?: string }>): void {
  _providerOverridesCache = overrides || {};
}

/** Replace the custom-provider override cache. */
export function setCustomProviderOverridesCache(
  overrides: Record<string, { apiKey?: string; baseUrl?: string; model?: string }>
): void {
  _customProviderOverridesCache = overrides || {};
}

/**
 * Returns true if the provider looks like it can be called right now —
 * i.e. it has a baseUrl, and (for non-local providers) an API key.
 */
export function isProviderConfigured(name: string): boolean {
  if (name === 'mock') return true;
  const cfg = getProviderConfig(name);
  if (!cfg.baseUrl) return false;
  // Local providers (LM Studio, ComfyUI) don't require an apiKey —
  // the loopback server in default config doesn't enforce one.
  if (cfg.isLocal) return true;
  return Boolean(cfg.apiKey);
}

/** Returns the names of providers that are currently configured. */
export function listConfiguredProviders(): string[] {
  return ['openrouter', 'lmstudio', 'minimax', 'xai', 'gemini', 'comfyui', 'mock'].filter(isProviderConfigured);
}
