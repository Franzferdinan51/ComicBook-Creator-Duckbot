/**
 * comic-creator server — per-user provider overrides.
 *
 * Lets the user supply their own `apiKey` and/or `baseUrl` for any built-in
 * provider (openrouter, lmstudio, minimax), and add arbitrary
 * OpenAI-compatible custom endpoints (LocalAI, Ollama, vLLM, proxies,
 * etc.), all through the WebUI without editing `~/.openclaw/openclaw.json`.
 *
 * File shape (state/provider-overrides.json):
 *   {
 *     "providers": {
 *       "<name>": { "apiKey"?: string, "baseUrl"?: string, "updatedAt"?: string }
 *     },
 *     "customProviders": {
 *       "<name>": { "name", "baseUrl", "apiKey"?, "model"?, "updatedAt" }
 *     }
 *   }
 *
 * Resolution order in `src/providers/config.ts` is:
 *   1. process.env
 *   2. provider-overrides (user-supplied via the WebUI)
 *   3. openclaw.json
 *   4. built-in defaults
 *
 * `apiKey` is stored in plain text on disk because the skill already has
 * access to the user's environment. If you want it sealed, swap to
 * `safeStorage` / Keychain access — out of scope for v1.
 *
 * Backward compat: the v1 file was a flat Record<string, ProviderOverride>
 * (no `providers` / `customProviders` wrapper). On load we detect the old
 * shape (entries with `apiKey` / `baseUrl` directly) and re-wrap under
 * `providers`. Old flat keys are preserved.
 */

import { join } from 'node:path';
import { getStorageDir, readJson, writeJsonAtomic } from './storage.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Override record for a single built-in provider. */
export interface ProviderOverride {
  apiKey?: string;
  baseUrl?: string;
  updatedAt?: string;
}

/** A user-defined OpenAI-compatible provider endpoint. */
export interface CustomProviderEntry {
  name: string;
  baseUrl: string;
  apiKey?: string;
  model?: string;
  updatedAt?: string;
}

/** Full overrides file shape. */
export interface OverridesFile {
  providers?: Record<string, ProviderOverride>;
  customProviders?: Record<string, CustomProviderEntry>;
}

function overridesFile(): string {
  return join(getStorageDir(), 'provider-overrides.json');
}

let _cached: OverridesFile | null = null;

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

/**
 * Detect whether a parsed JSON value is the v1 (flat) or v2 (nested) shape.
 * v1: `{ <name>: { apiKey?, baseUrl? } }` — entries have provider-override fields
 *     directly on them, no `providers` / `customProviders` wrapper.
 * v2: `{ providers?: {...}, customProviders?: {...} }` — has either wrapper key.
 */
function isV1Shape(raw: unknown): raw is Record<string, ProviderOverride> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if ('providers' in raw || 'customProviders' in raw) return false;
  // v1 entries have provider-override fields directly.
  for (const v of Object.values(raw)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if ('apiKey' in o || 'baseUrl' in o || 'updatedAt' in o) return true;
      // also if a name looks like a built-in provider override
      const name = o.name;
      if (typeof name === 'string' && ['openrouter', 'lmstudio', 'minimax'].includes(name)) {
        // v1 had no `name` field, so any entry WITH a `name` is not a v1 entry
        return false;
      }
    }
  }
  return false;
}

/** Read overrides from disk, migrating the v1 shape on the fly. */
export async function loadOverrides(): Promise<OverridesFile> {
  if (_cached) return _cached;
  const raw = (await readJson<unknown>(overridesFile(), {})) ?? {};
  let parsed: OverridesFile;
  if (isV1Shape(raw)) {
    // Migrate: every entry becomes a `providers` entry.
    const providers: Record<string, ProviderOverride> = {};
    for (const [name, value] of Object.entries(raw)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const v = value as Record<string, unknown>;
        providers[name] = {
          ...(typeof v.apiKey === 'string' ? { apiKey: v.apiKey } : {}),
          ...(typeof v.baseUrl === 'string' ? { baseUrl: v.baseUrl } : {}),
          ...(typeof v.updatedAt === 'string' ? { updatedAt: v.updatedAt } : {}),
        };
      }
    }
    parsed = { providers };
  } else {
    const r = raw as { providers?: unknown; customProviders?: unknown };
    const providers: Record<string, ProviderOverride> = {};
    if (r.providers && typeof r.providers === 'object' && !Array.isArray(r.providers)) {
      for (const [name, value] of Object.entries(r.providers as Record<string, unknown>)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const v = value as Record<string, unknown>;
          providers[name] = {
            ...(typeof v.apiKey === 'string' ? { apiKey: v.apiKey } : {}),
            ...(typeof v.baseUrl === 'string' ? { baseUrl: v.baseUrl } : {}),
            ...(typeof v.updatedAt === 'string' ? { updatedAt: v.updatedAt } : {}),
          };
        }
      }
    }
    const customProviders: Record<string, CustomProviderEntry> = {};
    if (r.customProviders && typeof r.customProviders === 'object' && !Array.isArray(r.customProviders)) {
      for (const [name, value] of Object.entries(r.customProviders as Record<string, unknown>)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const v = value as Record<string, unknown>;
          if (typeof v.baseUrl === 'string' && v.baseUrl.length > 0) {
            customProviders[name] = {
              name,
              baseUrl: v.baseUrl,
              ...(typeof v.apiKey === 'string' ? { apiKey: v.apiKey } : {}),
              ...(typeof v.model === 'string' ? { model: v.model } : {}),
              ...(typeof v.updatedAt === 'string' ? { updatedAt: v.updatedAt } : {}),
            };
          }
        }
      }
    }
    parsed = { providers, customProviders };
  }
  _cached = parsed;
  return parsed;
}

/** Persist the full overrides file. */
export async function saveOverrides(next: OverridesFile): Promise<OverridesFile> {
  await writeJsonAtomic(overridesFile(), next);
  _cached = next;
  return next;
}

// ---------------------------------------------------------------------------
// Built-in provider overrides
// ---------------------------------------------------------------------------

/** Patch a single built-in provider's override. */
export async function patchOverride(
  name: string,
  patch: { apiKey?: string | null; baseUrl?: string | null }
): Promise<OverridesFile> {
  const current = await loadOverrides();
  const existing = current.providers?.[name] ?? {};
  const nextEntry: ProviderOverride = {
    ...(patch.apiKey != null && patch.apiKey !== '' ? { apiKey: patch.apiKey } : {}),
    ...(patch.baseUrl != null && patch.baseUrl !== '' ? { baseUrl: patch.baseUrl } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (patch.apiKey === null) delete nextEntry.apiKey;
  if (patch.baseUrl === null) delete nextEntry.baseUrl;

  const merged = { ...existing, ...nextEntry };
  const hasContent = merged.apiKey || merged.baseUrl;
  const providers = { ...(current.providers ?? {}) };
  if (hasContent) {
    providers[name] = merged;
  } else {
    delete providers[name];
  }
  return saveOverrides({ ...current, providers });
}

/** Remove a single built-in provider's override. */
export async function clearOverride(name: string): Promise<OverridesFile> {
  const current = await loadOverrides();
  if (!current.providers || !(name in current.providers)) return current;
  const providers = { ...current.providers };
  delete providers[name];
  return saveOverrides({ ...current, providers });
}

// ---------------------------------------------------------------------------
// Custom provider entries
// ---------------------------------------------------------------------------

/** Reserved names that custom providers can't use. */
const RESERVED_NAMES = new Set(['mock', 'openrouter', 'lmstudio', 'minimax', '']);

/** Validate a custom-provider name. */
export function validateCustomName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = (raw ?? '').trim();
  if (!name) return { ok: false, error: 'name is required' };
  if (name.length > 64) return { ok: false, error: 'name must be 64 characters or fewer' };
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    return { ok: false, error: 'name must start with a letter/digit and contain only letters, digits, ., _, -' };
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    return { ok: false, error: `"${name}" is a reserved built-in provider name` };
  }
  return { ok: true, name };
}

/** Add or replace a custom provider entry. */
export async function upsertCustomProvider(entry: CustomProviderEntry): Promise<OverridesFile> {
  const v = validateCustomName(entry.name);
  if (!v.ok) throw new Error(v.error);
  if (!entry.baseUrl || typeof entry.baseUrl !== 'string') {
    throw new Error('baseUrl is required');
  }
  const current = await loadOverrides();
  const customProviders = { ...(current.customProviders ?? {}) };
  customProviders[v.name] = {
    name: v.name,
    baseUrl: entry.baseUrl,
    ...(entry.apiKey ? { apiKey: entry.apiKey } : {}),
    ...(entry.model ? { model: entry.model } : {}),
    updatedAt: new Date().toISOString(),
  };
  return saveOverrides({ ...current, customProviders });
}

/** Remove a custom provider entry. */
export async function removeCustomProvider(name: string): Promise<OverridesFile> {
  const current = await loadOverrides();
  if (!current.customProviders || !(name in current.customProviders)) return current;
  const customProviders = { ...current.customProviders };
  delete customProviders[name];
  return saveOverrides({ ...current, customProviders });
}

// ---------------------------------------------------------------------------
// Public views (no secrets)
// ---------------------------------------------------------------------------

/** Public view of an override — never leaks the full API key. */
export interface PublicOverrideView {
  name: string;
  hasKey: boolean;
  /** Last 4 chars of the key, for visual confirmation. */
  keyTail?: string;
  baseUrl?: string;
  updatedAt?: string;
  source: 'user' | 'none';
}

export function publicView(name: string, override: ProviderOverride | undefined): PublicOverrideView {
  if (!override) {
    return { name, hasKey: false, source: 'none' };
  }
  const out: PublicOverrideView = {
    name,
    hasKey: Boolean(override.apiKey),
    source: 'user',
    ...(override.baseUrl ? { baseUrl: override.baseUrl } : {}),
    ...(override.updatedAt ? { updatedAt: override.updatedAt } : {}),
  };
  if (override.apiKey && override.apiKey.length >= 4) {
    out.keyTail = override.apiKey.slice(-4);
  } else if (override.apiKey) {
    out.keyTail = override.apiKey;
  }
  return out;
}

/** Public view of a custom provider. */
export interface PublicCustomView {
  name: string;
  baseUrl: string;
  hasKey: boolean;
  keyTail?: string;
  model?: string;
  updatedAt?: string;
}

export function publicCustomView(entry: CustomProviderEntry | undefined): PublicCustomView | null {
  if (!entry) return null;
  const out: PublicCustomView = {
    name: entry.name,
    baseUrl: entry.baseUrl,
    hasKey: Boolean(entry.apiKey),
    ...(entry.model ? { model: entry.model } : {}),
    ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
  };
  if (entry.apiKey && entry.apiKey.length >= 4) {
    out.keyTail = entry.apiKey.slice(-4);
  } else if (entry.apiKey) {
    out.keyTail = entry.apiKey;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Test helper — drop the cache so the next read hits disk. */
export function _resetOverridesCache(): void {
  _cached = null;
}
