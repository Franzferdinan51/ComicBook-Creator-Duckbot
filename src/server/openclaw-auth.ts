/**
 * comic-creator server — openclaw auth integration.
 *
 * Reads OAuth tokens (and API keys) from openclaw's per-agent credential
 * store so the user doesn't have to re-paste their xAI/Gemini/etc.
 * credentials into the comic-creator Settings. The shape of
 * `auth-profiles.json` is documented at
 * https://docs.openclaw.io/agents/auth-profiles (or the equivalent in
 * `openclaw help models auth list`).
 *
 * File shape (simplified):
 *   {
 *     "version": 1,
 *     "profiles": {
 *       "<profile-id>": {
 *         "type": "oauth" | "api_key",
 *         "provider": "xai" | "minimax-portal" | ...,
 *         "email": "user@example.com",           // OAuth only
 *         "access":  "<bearer-jwt>",              // OAuth only
 *         "refresh": "<refresh-token>",           // OAuth only
 *         "idToken": "<oidc-id-token>",           // OAuth only
 *         "accountId": "<uuid>",                  // OAuth only
 *         "expires": 1780429145589,               // epoch ms (OAuth only)
 *         "key":     "<api-key>"                  // api_key only
 *       }
 *     }
 *   }
 *
 * We don't try to refresh expired tokens ourselves — that requires the
 * provider's OAuth client_id/secret which the openclaw plugin owns. If
 * the token's expired, we surface that fact to the user and tell them
 * to re-auth via openclaw (`openclaw models auth login --device-code
 * --provider=xai`).
 *
 * The token cache is in-memory and refreshed on a 30-second timer. Token
 * reads are cheap (small JSON file), but we don't want to re-read on
 * every API call.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CACHE_TTL_MS = 30_000;

/** Path to openclaw's per-main-agent auth profile store. If the user
 *  runs the comic-creator from a different agent context, the path can
 *  be overridden via the `OPENCLAW_AUTH_PROFILES_PATH` env var. */
function defaultAuthProfilesPath(): string {
  const override = process.env.OPENCLAW_AUTH_PROFILES_PATH;
  if (override) return override;
  return join(homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
}

export interface XAIAuthStatus {
  /** True when an xai OAuth profile exists and the access token is not
   *  expired (with a 60-second safety margin). */
  signedIn: boolean;
  /** Email the user signed in with, if any. */
  email?: string;
  /** ISO timestamp the token expires at. */
  expiresAt?: string;
  /** Seconds until expiry (negative if already expired). */
  expiresIn?: number;
  /** Human-readable reason if not signed in (e.g. "no profile", "expired"). */
  reason?: string;
  /** Where we found the token (for debugging). */
  source: 'openclaw' | 'env' | 'override' | 'none';
}

interface OAuthProfile {
  type: 'oauth' | 'api_key' | string;
  provider: string;
  email?: string;
  access?: string;
  refresh?: string;
  idToken?: string;
  accountId?: string;
  expires?: number;
  key?: string;
}

interface AuthProfilesFile {
  version: number;
  profiles: Record<string, OAuthProfile>;
}

interface CachedAuth {
  fetchedAt: number;
  data: AuthProfilesFile | null;
}

let _cache: CachedAuth | null = null;

function readAuthProfiles(): AuthProfilesFile | null {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.data;
  }
  const path = defaultAuthProfilesPath();
  if (!existsSync(path)) {
    _cache = { fetchedAt: Date.now(), data: null };
    return null;
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as AuthProfilesFile;
    _cache = { fetchedAt: Date.now(), data: parsed };
    return parsed;
  } catch (err) {
    console.warn(`[openclaw-auth] failed to read ${path}: ${(err as Error).message}`);
    _cache = { fetchedAt: Date.now(), data: null };
    return null;
  }
}

/** Find the xAI OAuth profile. Prefers a profile whose email matches
 *  `preferredEmail` (if set in env), else returns the first xai profile
 *  found. */
function findXAIProfile(data: AuthProfilesFile, preferredEmail?: string): OAuthProfile | null {
  const candidates: Array<{ id: string; profile: OAuthProfile }> = [];
  for (const [id, profile] of Object.entries(data.profiles ?? {})) {
    if (profile?.provider === 'xai' && profile.type === 'oauth' && profile.access) {
      candidates.push({ id, profile });
    }
  }
  if (candidates.length === 0) return null;
  if (preferredEmail) {
    const match = candidates.find((c) => c.profile.email === preferredEmail);
    if (match) return match.profile;
  }
  return candidates[0]!.profile;
}

/** Public status for the Settings page — what should we show the user? */
export function getXAIStatus(): XAIAuthStatus {
  // The env var always wins.
  if (process.env.XAI_API_KEY || process.env.GROK_API_KEY) {
    return { signedIn: true, source: 'env' };
  }
  const data = readAuthProfiles();
  if (!data) {
    return { signedIn: false, reason: 'openclaw auth store not found', source: 'none' };
  }
  const profile = findXAIProfile(data);
  if (!profile) {
    return { signedIn: false, reason: 'no xAI profile in openclaw', source: 'none' };
  }
  const expiresMs = profile.expires;
  if (typeof expiresMs !== 'number') {
    return {
      signedIn: false,
      reason: 'xAI profile missing expires timestamp',
      source: 'openclaw',
    };
  }
  const now = Date.now();
  // Treat the token as expired 60s early so we don't get caught mid-call.
  const valid = expiresMs - 60_000 > now;
  if (!valid) {
    return {
      signedIn: false,
      email: profile.email,
      expiresAt: new Date(expiresMs).toISOString(),
      expiresIn: Math.round((expiresMs - now) / 1000),
      reason: 'token expired',
      source: 'openclaw',
    };
  }
  return {
    signedIn: true,
    email: profile.email,
    expiresAt: new Date(expiresMs).toISOString(),
    expiresIn: Math.round((expiresMs - now) / 1000),
    source: 'openclaw',
  };
}

/** Read the xAI access token, if available and valid. Returns
 *  `undefined` if there's no usable token. */
export function readXAIToken(): string | undefined {
  if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY;
  if (process.env.GROK_API_KEY) return process.env.GROK_API_KEY;
  const data = readAuthProfiles();
  if (!data) return undefined;
  const profile = findXAIProfile(data);
  if (!profile?.access) return undefined;
  const expiresMs = profile.expires;
  if (typeof expiresMs !== 'number') return undefined;
  if (expiresMs - 60_000 <= Date.now()) return undefined;
  return profile.access;
}

/** Test helper — drop the cache so the next read hits disk. */
export function _resetAuthCache(): void {
  _cache = null;
}

// ---------------------------------------------------------------------------
// xAI sign-in via openclaw device flow
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';

export interface XAILoginProgress {
  /** True while the openclaw login child process is running. */
  running: boolean;
  /** URL the user needs to visit in their browser (with code embedded
   *  for the device-flow pattern). Captured from the child's stdout. */
  deviceUrl?: string;
  /** User code, when emitted separately. (xAI's flow embeds it in the
   *  URL so this is usually undefined.) */
  userCode?: string;
  /** Raw stdout/stderr so the UI can show a live log. */
  log: string[];
  /** Final status once `running` is false. */
  status?: 'success' | 'cancelled' | 'error';
  /** Error message when status === 'error'. */
  error?: string;
}

let _login: XAILoginProgress = { running: false, log: [] };
let _child: ReturnType<typeof spawn> | null = null;

/** Find the device-flow URL emitted by the openclaw CLI. The CLI uses
 *  a TTY-styled print, so the URL sits on a line by itself after the
 *  "Open this URL in your browser" prompt. We also catch any line
 *  containing `https://` and an xAI/Grok auth domain. */
function extractDeviceUrl(line: string): string | undefined {
  // Common URL matchers we expect to see in the CLI's output.
  const patterns = [
    /https:\/\/console\.x\.ai\/oauth\/device[^\s)"]*/i,
    /https:\/\/accounts\.x\.ai\/oauth\/device[^\s)"]*/i,
    /https:\/\/auth\.x\.ai\/device[^\s)"]*/i,
    /https:\/\/[^\s)"]*device[^\s)"]*/i,
  ];
  for (const p of patterns) {
    const m = line.match(p);
    if (m) return m[0];
  }
  return undefined;
}

/** Start the openclaw xAI device-flow login. The first URL the CLI
 *  prints (typically the xAI device URL) is captured and returned via
 *  `getXAILoginProgress()`. The process runs in the background; the
 *  caller is responsible for showing the URL to the user.
 *
 *  The openclaw device-flow login requires a TTY (it draws a
 *  interactive prompt). We allocate one via the `script` command (a
 *  standard BSD utility on macOS, also present on most Linux distros)
 *  so the child sees a pseudo-tty. The URL still ends up on stdout,
 *  which we capture as usual. */
export function startXAILogin(): { started: boolean; reason?: string } {
  if (_login.running) {
    return { started: false, reason: 'login already in progress' };
  }
  _login = { running: true, log: [] };
  try {
    // `script -q /dev/null <cmd...>` runs <cmd> under a pty and discards
    // the typescript. The child's stdout (including the URL) flows
    // through to our pipe as normal.
    _child = spawn(
      'script',
      ['-q', '/dev/null', 'openclaw', 'models', 'auth', 'login', '--device-code', '--provider=xai'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (err) {
    _login = {
      running: false,
      log: [],
      status: 'error',
      error: `failed to spawn openclaw: ${(err as Error).message}`,
    };
    return { started: false, reason: _login.error };
  }
  if (!_child) {
    _login = { running: false, log: [], status: 'error', error: 'spawn returned null' };
    return { started: false, reason: 'spawn returned null' };
  }

  const handleChunk = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
    const text = chunk.toString('utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      _login.log.push(`[${stream}] ${line}`);
      if (!_login.deviceUrl) {
        const url = extractDeviceUrl(line);
        if (url) _login.deviceUrl = url;
      }
    }
  };
  _child.stdout?.on('data', (b) => handleChunk(b, 'stdout'));
  _child.stderr?.on('data', (b) => handleChunk(b, 'stderr'));

  _child.on('close', (code) => {
    _child = null;
    if (_login.status === 'cancelled') return; // already set
    if (code === 0) {
      _login.running = false;
      _login.status = 'success';
      // Re-read the auth store so the next provider call sees the new token.
      _cache = null;
    } else {
      _login.running = false;
      _login.status = 'error';
      _login.error = `openclaw exited with code ${code ?? 'null'}`;
    }
  });
  _child.on('error', (err) => {
    _child = null;
    _login.running = false;
    _login.status = 'error';
    _login.error = err.message;
  });

  return { started: true };
}

/** Cancel an in-flight device-flow login. Safe to call when nothing is
 *  running. */
export function cancelXAILogin(): void {
  if (!_child) return;
  _login.status = 'cancelled';
  _login.running = false;
  try { _child.kill('SIGTERM'); } catch { /* already dead */ }
  _child = null;
}

/** Read the current state of the device-flow login. */
export function getXAILoginProgress(): XAILoginProgress {
  return { ..._login, log: _login.log.slice(-100) };
}
