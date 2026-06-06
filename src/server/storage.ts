/**
 * comic-creator server — JSON-based persistence.
 *
 * Two files in `<skill>/state/`:
 *   - history.json   — array of HistoryEntry (max 50, FIFO trim)
 *   - settings.json  — Settings (user-editable preferences)
 *
 * All writes are atomic (write to .tmp, rename). Reads tolerate missing
 * or malformed files and fall back to defaults — so the server can boot
 * cleanly on a fresh install.
 *
 * The directory path can be overridden via `setStorageDir()` (used by the
 * test suite to keep its state under /tmp).
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import type {
  AdaptationPackage,
  AgentGuidancePackage,
  AgentWorkflowPackage,
  ComicScript,
  MusicCuePackage,
  ProductionRunManifest,
  ProjectGoal,
  SeriesPackage,
  StoryProject,
  TrailerPackage,
  VideoPackage,
} from '../types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single entry in the comic history. Persists enough info to render a
 *  history list (title, art style, page count, output path) without re-reading
 *  every PDF on disk. */
export interface HistoryEntry {
  jobId: string;
  title: string;
  createdAt: string;        // ISO timestamp
  artStyle: string;
  pageCount: number;
  /** Primary output path (the format the user originally requested). */
  outputPath: string;
  /** Pre-rendered PDF path, if available. Newer jobs always have this. */
  pdfPath?: string;
  /** Pre-rendered CBZ path, if available. Newer jobs always have this. */
  cbzPath?: string;
  /** Cover/title page image, if generated. */
  coverImagePath?: string;
  /** Structured project artifact used to derive the comic. */
  project?: StoryProject;
  /** Path to the generated full project JSON artifact. */
  projectPath?: string;
  /** Screen/show adaptation artifact for the project. */
  adaptationPackage?: AdaptationPackage;
  /** Series / episode planning artifact for the project. */
  seriesPackage?: SeriesPackage;
  /** Trailer / teaser artifact for the project. */
  trailerPackage?: TrailerPackage;
  /** MiniMax-ready video generation artifact for the project. */
  videoPackage?: VideoPackage;
  /** Music or song-development artifact for the project. */
  musicCuePackage?: MusicCuePackage;
  /** Agent orchestration guidance artifact for the project. */
  agentGuidancePackage?: AgentGuidancePackage;
  /** Hermes/OpenClaw execution workflow artifact for the project. */
  agentWorkflowPackage?: AgentWorkflowPackage;
  /** MiniMax/OpenClaw/Hermes concrete production run manifest. */
  productionRunManifest?: ProductionRunManifest;
  /** Path to the generated markdown handoff for external agents. */
  agentGuidancePath?: string;
  /** Path to the generated agent workflow package JSON. */
  agentWorkflowPackagePath?: string;
  /** Path to the generated production run manifest JSON. */
  productionRunManifestPath?: string;
  /** Path to the generated screenplay markdown handoff. */
  screenplayPath?: string;
  /** Path to the generated director brief markdown handoff. */
  directorBriefPath?: string;
  /** Path to the repository playbook for Hermes/OpenClaw follow-up. */
  agentPlaybookPath?: string;
  /** Path to the generated song sheet markdown. */
  songSheetPath?: string;
  /** Path to the generated theme WAV. */
  songAudioPath?: string;
  /** Path to the generated music cue package JSON. */
  musicCuePackagePath?: string;
  /** Path to the generated series package JSON. */
  seriesPackagePath?: string;
  /** Music provider used to generate the theme audio. */
  musicProvider?: string;
  /** Path to the generated storyboard package JSON. */
  storyboardPackagePath?: string;
  /** Path to the generated trailer package JSON. */
  trailerPackagePath?: string;
  /** Path to the generated video package JSON. */
  videoPackagePath?: string;
  /** Path to the generated animatic timeline JSON. */
  animaticTimelinePath?: string;
  /** Path to the generated unified studio bundle JSON. */
  studioBundlePath?: string;
  scriptJson: ComicScript;  // the full script (so the frontend can re-render)
  thumbnailPath?: string;   // optional — reserved for future
  /** Project goal at the time of generation — used for filtering in the
   *  history view. Optional for legacy entries; defaults to "comic". */
  projectGoal?: ProjectGoal;
  /** User-applied tags. Free-form lowercase strings ("hero", "noir",
   *  "draft-v2", "client-acme"). Empty array = no tags. */
  tags?: string[];
  /** Whether the user has starred this comic. */
  favorite?: boolean;
  /** ISO timestamp of the last edit (fav/tag toggle, etc). */
  updatedAt?: string;
}

/** User-editable settings. */
export interface Settings {
  defaultProvider: string;
  defaultTextProvider: string;
  defaultImageProvider: string;
  defaultArtStyle: string;
  defaultPageCount: number;
  defaultOutputFormat: 'pdf' | 'cbz';
  defaultProjectGoal: ProjectGoal;
}

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: 'mock',
  defaultTextProvider: 'mock',
  defaultImageProvider: 'mock',
  defaultArtStyle: 'manga',
  defaultPageCount: 4,
  defaultOutputFormat: 'pdf',
  defaultProjectGoal: 'comic',
};

/**
 * Choose a sensible default provider by inspecting the live provider config.
 * Order: first configured real provider → mock.
 * Used by `resolveSettings()` so a fresh install with API keys already set
 * doesn't ship with "mock" as the default.
 */
async function pickDefaultProvider(kind: 'text' | 'image'): Promise<string> {
  try {
    // Lazy import to avoid a hard module-graph dependency in tests.
    const { listConfiguredProviders, isProviderConfigured } = await import('../providers/config.js');
    const candidates = kind === 'text'
      ? ['minimax', 'openrouter', 'lmstudio', 'mock']
      : ['minimax', 'openrouter', 'lmstudio', 'mock'];
    for (const name of candidates) {
      if (isProviderConfigured(name)) return name;
    }
  } catch (err) {
    console.warn(`[storage] failed to pick default ${kind} provider: ${(err as Error).message}`);
  }
  return 'mock';
}

let _defaultsResolved: Settings | null = null;

/**
 * Returns the effective defaults for a fresh install. Unlike
 * `DEFAULT_SETTINGS`, this picks a real provider if one is configured —
 * so the user doesn't have to open Settings on first launch.
 */
export async function resolveDefaultSettings(): Promise<Settings> {
  if (_defaultsResolved) return _defaultsResolved;
  const [text, image] = await Promise.all([
    pickDefaultProvider('text'),
    pickDefaultProvider('image'),
  ]);
  _defaultsResolved = {
    ...DEFAULT_SETTINGS,
    defaultProvider: text !== 'mock' ? text : 'mock',
    defaultTextProvider: text,
    defaultImageProvider: image,
  };
  return _defaultsResolved;
}

const MAX_HISTORY = 50;

// ---------------------------------------------------------------------------
// Storage directory resolution
// ---------------------------------------------------------------------------

let _storageDir: string | null = null;

/** Resolve the storage dir. Default: `<skill>/state/`. */
export function getStorageDir(): string {
  if (_storageDir) return _storageDir;
  // src/server/storage.ts is two levels under the skill root.
  // import.meta.url points to the on-disk file; resolve relative to that.
  const url = new URL('.', import.meta.url);
  // /.../src/server/  →  /.../state
  const skillRoot = join(url.pathname, '..', '..');
  _storageDir = join(skillRoot, 'state');
  return _storageDir;
}

/** Override the storage dir (test helper). */
export function setStorageDir(dir: string): void {
  _storageDir = dir;
}

// ---------------------------------------------------------------------------
// Atomic file helpers
// ---------------------------------------------------------------------------

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Read JSON from a file, falling back to `fallback` on missing/malformed. */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    console.warn(`[storage] failed to read ${file}: ${(err as Error).message}. Using fallback.`);
    return fallback;
  }
}

/** Atomically write JSON: write to .tmp-<uuid>, then rename. */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await ensureDir(dirname(file));
  const tmp = `${file}.tmp-${randomUUID()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function historyFile(): string {
  return join(getStorageDir(), 'history.json');
}

// In-process lock that serializes history mutations. Multiple comic jobs can
// finish in parallel and each tries to append; without this lock, two
// concurrent read-modify-write operations race and the second write clobbers
// the first. The lock is a promise chain — each .then() chains off the
// previous operation so they execute strictly in order. This is sufficient
// for a single-server WebUI; a multi-instance deploy would need a real
// filesystem lock or a database.
let _historyLock: Promise<unknown> = Promise.resolve();
function withHistoryLock<T>(op: () => Promise<T>): Promise<T> {
  const next = _historyLock.then(op, op);
  // Swallow rejections in the chain so one failure doesn't break all
  // future calls. The .catch() lives on `next` itself, not the lock.
  _historyLock = next.catch(() => undefined);
  return next;
}

/** Read the full history. */
export async function loadHistory(): Promise<HistoryEntry[]> {
  const list = await readJson<HistoryEntry[]>(historyFile(), []);
  return Array.isArray(list) ? list : [];
}

/** Prepend a new entry. Trims the list to MAX_HISTORY. */
export async function appendHistory(entry: HistoryEntry): Promise<void> {
  return withHistoryLock(async () => {
    const list = await loadHistory();
    // Newest first
    list.unshift(entry);
    if (list.length > MAX_HISTORY) {
      list.length = MAX_HISTORY;
    }
    await writeJsonAtomic(historyFile(), list);
  });
}

/** Remove a single entry by jobId. Returns true if something was removed. */
export async function removeHistoryEntry(jobId: string): Promise<boolean> {
  return withHistoryLock(async () => {
    const list = await loadHistory();
    const next = list.filter((e) => e.jobId !== jobId);
    if (next.length === list.length) return false;
    await writeJsonAtomic(historyFile(), next);
    return true;
  });
}

/** Update an existing entry by jobId, or insert if not found. */
export async function upsertHistoryEntry(entry: HistoryEntry): Promise<void> {
  return withHistoryLock(async () => {
    const list = await loadHistory();
    const idx = list.findIndex((e) => e.jobId === entry.jobId);
    if (idx >= 0) {
      list[idx] = entry;
    } else {
      list.unshift(entry);
      if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
    }
    await writeJsonAtomic(historyFile(), list);
  });
}

/** Find one history entry. */
export async function findHistoryEntry(jobId: string): Promise<HistoryEntry | undefined> {
  const list = await loadHistory();
  return list.find((e) => e.jobId === jobId);
}

export interface HistoryFilter {
  /** Free-text search across title + tag list (case-insensitive substring). */
  q?: string;
  /** Filter by project goal. */
  projectGoal?: ProjectGoal;
  /** Filter by art style (case-insensitive). */
  artStyle?: string;
  /** If true, only return favorites. If false, exclude favorites. */
  favorite?: boolean;
  /** If non-empty, only return entries that contain ALL of these tags (AND). */
  tags?: string[];
  /** Max number of results to return (after filtering). */
  limit?: number;
}

/** Apply an in-memory filter to the history list. The full list is small
 *  (≤ 50 entries by MAX_HISTORY), so a linear scan is fine and avoids the
 *  need for a separate index. */
export function filterHistory(entries: HistoryEntry[], filter: HistoryFilter = {}): HistoryEntry[] {
  let out = entries;
  if (filter.q) {
    const needle = filter.q.toLowerCase().trim();
    if (needle) {
      out = out.filter((e) => {
        const titleHit = (e.title || '').toLowerCase().includes(needle);
        const tagHit = (e.tags || []).some((t) => t.toLowerCase().includes(needle));
        return titleHit || tagHit;
      });
    }
  }
  if (filter.projectGoal) {
    out = out.filter((e) => (e.projectGoal || 'comic') === filter.projectGoal);
  }
  if (filter.artStyle) {
    const needle = filter.artStyle.toLowerCase();
    out = out.filter((e) => (e.artStyle || '').toLowerCase().includes(needle));
  }
  if (filter.favorite === true) {
    out = out.filter((e) => e.favorite === true);
  } else if (filter.favorite === false) {
    out = out.filter((e) => e.favorite !== true);
  }
  if (filter.tags && filter.tags.length > 0) {
    const wanted = new Set(filter.tags.map((t) => t.toLowerCase()));
    out = out.filter((e) => {
      const have = new Set((e.tags || []).map((t) => t.toLowerCase()));
      for (const t of wanted) if (!have.has(t)) return false;
      return true;
    });
  }
  if (typeof filter.limit === 'number' && filter.limit > 0) {
    out = out.slice(0, filter.limit);
  }
  return out;
}

/** Patch one history entry's user-applied metadata (tags, favorite, projectGoal).
 *  Returns the updated entry, or undefined if not found. */
export async function patchHistoryEntryMeta(
  jobId: string,
  patch: { favorite?: boolean; tags?: string[]; projectGoal?: ProjectGoal }
): Promise<HistoryEntry | undefined> {
  return withHistoryLock(async () => {
    const list = await loadHistory();
    const idx = list.findIndex((e) => e.jobId === jobId);
    if (idx < 0) return undefined;
    // Normalize tag list: trim, lowercase, drop empty, dedupe, cap at 16.
    // Same logic the route handler applies so any caller (HTTP or
    // MCP) sees consistent behavior.
    let normalizedTags: string[] | undefined;
    if (patch.tags !== undefined) {
      const seen = new Set<string>();
      const cleaned: string[] = [];
      for (const raw of patch.tags) {
        if (typeof raw !== 'string') continue;
        const t = raw.trim().toLowerCase();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        cleaned.push(t);
        if (cleaned.length >= 16) break;
      }
      normalizedTags = cleaned;
    }
    const next: HistoryEntry = {
      ...list[idx],
      ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
      ...(normalizedTags !== undefined ? { tags: normalizedTags } : {}),
      ...(patch.projectGoal !== undefined ? { projectGoal: patch.projectGoal } : {}),
      updatedAt: new Date().toISOString(),
    };
    list[idx] = next;
    await writeJsonAtomic(historyFile(), list);
    return next;
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function settingsFile(): string {
  return join(getStorageDir(), 'settings.json');
}

/** Read settings, merging with defaults so missing fields are filled. */
export async function loadSettings(): Promise<Settings> {
  const raw = await readJson<Partial<Settings>>(settingsFile(), {});
  // Resolve smart defaults (real provider when one is configured) only when
  // the user hasn't persisted settings yet — never silently override their
  // explicit choice.
  const effective = Object.keys(raw).length > 0
    ? DEFAULT_SETTINGS
    : await resolveDefaultSettings();
  return { ...effective, ...raw };
}

// In-process lock for settings mutations — same pattern as `_historyLock`
// above. Concurrent settings saves (e.g. the debounced auto-save in the
// WebUI racing with a manual PUT) would otherwise clobber each other.
let _settingsLock: Promise<unknown> = Promise.resolve();
function withSettingsLock<T>(op: () => Promise<T>): Promise<T> {
  const next = _settingsLock.then(op, op);
  _settingsLock = next.catch(() => undefined);
  return next;
}

/** Persist new settings. Merges with existing (so PUT with a partial body works). */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return withSettingsLock(async () => {
    const current = await loadSettings();
    const next: Settings = { ...current, ...patch };
    await writeJsonAtomic(settingsFile(), next);
    return next;
  });
}
