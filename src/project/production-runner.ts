import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  MusicCuePackage,
  ProductionRunManifest,
  ProductionRunPhase,
  ProductionRunReport,
  ProductionRunStep,
  VideoPackage,
} from '../types.js';

/**
 * The minimum shape the runner needs from a finished comic. Both
 * `ComicResult` and a `HistoryEntry` satisfy this — the history entry
 * is the typical case for "run an old job's manifest against MiniMax".
 */
export interface ProductionSource {
  script: { title: string };
  musicCuePackage: MusicCuePackage;
  videoPackage: VideoPackage;
}

export interface ProductionRunnerOptions {
  /** Directory the runner drops artifacts into. Created if missing. */
  outputDir: string;
  /** Called every time a phase changes status (start, step done, end). */
  onPhaseUpdate?: (phase: ProductionRunPhase) => void;
  /** When true, skip real mmx CLI calls. Build the planned command list,
   *  mark every step as `pending`, and return. Useful for `--dry-run`. */
  dryRun?: boolean;
  /** Abort signal. If aborted mid-run, the current step's child process
   *  is killed, the phase is marked `error` with "aborted", and the
   *  remaining phases are skipped. */
  signal?: AbortSignal;
  /** Max seconds to wait for a single video task. Defaults to 600. */
  videoTimeoutSec?: number;
  /** Seconds between `mmx video task get` polls. Defaults to 5. */
  videoPollIntervalSec?: number;
  /** Override the `comic-creator` binary the preflight phase uses.
   *  Defaults to `comic-creator` (resolved via PATH). */
  comicCreatorBin?: string;
  /** Override the `mmx` binary. Defaults to `mmx`. */
  mmxBin?: string;
  /** When true, the runner looks for an existing
   *  `<outputDir>/<slug>-production-run-report.json` and re-uses any
   *  phase whose `status === 'done'` AND whose expected output files
   *  still exist on disk. Other phases run normally. The preflight
   *  phase always re-runs (it's cheap and the gate is
   *  timing-sensitive). Defaults to false (no resume). */
  resume?: boolean;
}

const STDOUT_CAP_BYTES = 64 * 1024;
const STDOUT_TRUNCATION_MARKER = '\n…[truncated]…';

/** Truncate a captured buffer so a runaway mmx call can't OOM the report. */
function capBuffer(buf: Buffer): string {
  if (buf.length <= STDOUT_CAP_BYTES) return buf.toString('utf8');
  return (
    buf.subarray(0, STDOUT_CAP_BYTES).toString('utf8') + STDOUT_TRUNCATION_MARKER
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'comic-project'
  );
}

/** File path of the on-disk report for a given output dir + slug. */
export function reportPathFor(outputDir: string, slug: string): string {
  return join(outputDir, `${slug}-production-run-report.json`);
}

/** Read an existing report from disk, or null if the file is missing
 *  or unparseable. Used by the resume path. */
async function tryLoadExistingReport(path: string): Promise<ProductionRunReport | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as ProductionRunReport;
    // Sanity check: the report should look like one of ours.
    if (parsed.format !== undefined && parsed.format !== 'production-run-report') {
      // tolerate future format versions but bail on unrelated JSON
      return null;
    }
    if (!Array.isArray(parsed.phases)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Decide which phases from a prior report can be carried forward.
 *  A phase carries forward iff:
 *    - status === 'done'
 *    - every output file in `phase.outputs` still exists on disk
 *  Preflight is excluded (cheap and time-sensitive).
 *
 *  Returns the subset of `phases` that should be reused, with a
 *  `resumedAt` set on each carried-forward phase so the new report
 *  shows what was reused.
 */
function carryForwardPhases(
  prior: ProductionRunReport,
  manifest: ProductionRunManifest
): ProductionRunPhase[] {
  const reused: ProductionRunPhase[] = [];
  const manifestPhaseIds = new Set(manifest.phases.map((p) => p.phaseId));
  for (const phase of prior.phases) {
    if (phase.phaseId === 'preflight') continue; // always re-run
    if (!manifestPhaseIds.has(phase.phaseId)) continue; // stale
    if (phase.status !== 'done') continue;
    const allOutputsExist =
      Array.isArray(phase.outputs) &&
      phase.outputs.length > 0 &&
      phase.outputs.every((p) => existsSync(p));
    if (!allOutputsExist) continue;
    // Mark the phase as reused by appending a "resumed" step to its
    // step list. We don't mutate the prior — the caller merges it
    // into the new report under a new `startedAt`.
    reused.push({
      ...phase,
      steps: [
        ...phase.steps,
        {
          label: 'reused from prior report',
          cmd: 'runner',
          args: ['resume'],
          exitCode: 0,
          stdout: `reused at ${nowIso()}`,
          stderr: null,
          durationMs: 0,
        },
      ],
    });
  }
  return reused;
}

interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  aborted: boolean;
}

/**
 * Run a single child process and capture its output. Uses spawn (not
 * exec) so a runaway command can't blow the buffer. Resolves with
 * `{ exitCode, stdout, stderr, durationMs }`. If `signal` aborts
 * mid-flight, the child is killed and `aborted: true` is set.
 */
function runChild(
  cmd: string,
  args: string[],
  signal: AbortSignal | undefined,
  env?: NodeJS.ProcessEnv
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let aborted = false;

    let child;
    try {
      child = spawn(cmd, args, {
        env: env ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({
        exitCode: null,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        aborted: false,
      });
      return;
    }

    const onAbort = () => {
      aborted = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // already dead
      }
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = stdout.length + chunk.length <= STDOUT_CAP_BYTES * 2
        ? Buffer.concat([stdout, chunk])
        : Buffer.concat([stdout.subarray(0, STDOUT_CAP_BYTES), chunk.subarray(0, STDOUT_CAP_BYTES)]);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = stderr.length + chunk.length <= STDOUT_CAP_BYTES * 2
        ? Buffer.concat([stderr, chunk])
        : Buffer.concat([stderr.subarray(0, STDOUT_CAP_BYTES), chunk.subarray(0, STDOUT_CAP_BYTES)]);
    });

    child.on('error', (err) => {
      stderr = Buffer.concat([stderr, Buffer.from(err.message, 'utf8')]);
    });

    child.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve({
        exitCode: code,
        stdout: capBuffer(stdout),
        stderr: capBuffer(stderr),
        durationMs: Date.now() - start,
        aborted,
      });
    });
  });
}

interface ParsedTaskStatus {
  status: string;
  fileId?: string;
  rawJson: string;
}

function parseTaskGetJson(stdout: string): ParsedTaskStatus | null {
  // `mmx video task get --output json` returns a JSON document on stdout.
  // Different mmx versions wrap it in slightly different shapes; accept
  // both the unwrapped object and a { task: ... } envelope.
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const inner = (parsed.task as Record<string, unknown> | undefined) ?? parsed;
    const status = String(inner.status ?? inner.state ?? '');
    const fileId =
      (inner.file_id as string | undefined) ??
      (inner.fileId as string | undefined) ??
      (inner.file_id_str as string | undefined);
    return { status, fileId, rawJson: trimmed };
  } catch {
    return null;
  }
}

function parseAsyncSubmitJson(stdout: string): { taskId?: string } {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('{')) return {};
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const taskId =
      (parsed.task_id as string | undefined) ??
      (parsed.taskId as string | undefined) ??
      (parsed.id as string | undefined);
    return { taskId };
  } catch {
    return {};
  }
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        resolve();
      }, { once: true });
    }
  });
}

/** Run `mmx` with `--output json` and capture its parsed JSON. Returns
 *  the raw stdout even when JSON parsing fails, so the caller can
 *  surface the human-readable text in the report. */
async function runMmxJson(
  bin: string,
  args: string[],
  signal: AbortSignal | undefined
): Promise<{ result: SpawnResult; json: unknown | null }> {
  const fullArgs = [...args, '--output', 'json'];
  const result = await runChild(bin, fullArgs, signal);
  let json: unknown | null = null;
  try {
    const trimmed = result.stdout.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      json = JSON.parse(trimmed);
    }
  } catch {
    json = null;
  }
  return { result, json };
}

function makeStep(label: string, cmd: string, args: string[]): ProductionRunStep {
  return {
    label,
    cmd,
    args,
    exitCode: null,
    stdout: '',
    stderr: null,
    durationMs: 0,
  };
}

function isTerminalVideoStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'success' || s === 'succeeded' || s === 'completed' || s === 'done' || s === 'fail' || s === 'failed' || s === 'cancelled' || s === 'canceled';
}

function isSuccessfulVideoStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'success' || s === 'succeeded' || s === 'completed' || s === 'done';
}

/**
 * Run a `ProductionRunManifest` end-to-end.
 *
 * The manifest is a *recipe*. This function is the cook. It:
 *  1. Runs preflight via `comic-creator --preflight --json`.
 *  2. Generates theme audio via `mmx music generate`.
 *  3. Generates one video per clip in `result.videoPackage.clips` via
 *     `mmx video generate --async`, polls with `mmx video task get`,
 *     and downloads via `mmx video download`.
 *  4. Records a review summary phase that just lists the produced
 *     files.
 *
 * The runner writes a `production-run-report.json` to `outputDir` and
 * returns the in-memory `ProductionRunReport`. If the caller passes
 * `signal` and aborts, in-flight children are killed and remaining
 * phases are skipped (with `status: 'error'` on the killed phase and
 * `status: 'skipped'` on the rest).
 */
export async function runProductionManifest(
  manifest: ProductionRunManifest,
  source: ProductionSource,
  opts: ProductionRunnerOptions
): Promise<ProductionRunReport> {
  const startedAt = nowIso();
  const outputDir = opts.outputDir;
  const dryRun = opts.dryRun === true;
  const signal = opts.signal;
  const mmxBin = opts.mmxBin ?? 'mmx';
  const comicBin = opts.comicCreatorBin ?? 'comic-creator';
  const videoTimeoutSec = opts.videoTimeoutSec ?? 600;
  const videoPollIntervalSec = opts.videoPollIntervalSec ?? 5;
  const resume = opts.resume === true;
  const slug = slugify(manifest.title);

  await mkdir(outputDir, { recursive: true });

  const report: ProductionRunReport = {
    format: 'production-run-report',
    startedAt,
    completedAt: '',
    manifest: {
      jobId: manifest.jobId,
      title: manifest.title,
      projectGoal: manifest.projectGoal,
    },
    outputDir,
    phases: [],
    files: [],
    taskIds: [],
    errors: [],
    dryRun,
  };

  const pushPhase = (phase: ProductionRunPhase) => {
    const idx = report.phases.findIndex((p) => p.phaseId === phase.phaseId);
    if (idx < 0) report.phases.push(phase);
    else report.phases[idx] = phase;
    opts.onPhaseUpdate?.(phase);
  };

  // Resume support: when `resume: true`, load the prior report and
  // carry forward any phase that is `done` with all output files
  // still on disk. The phases are added to `report.phases` immediately
  // (and emitted via onPhaseUpdate) so the WebUI sees them right away,
  // but the phase-running code below still gets to skip them.
  const carriedForward: ProductionRunPhase[] = [];
  if (resume && !dryRun) {
    const prior = await tryLoadExistingReport(reportPathFor(outputDir, slug));
    if (prior) {
      for (const phase of carryForwardPhases(prior, manifest)) {
        carriedForward.push(phase);
        report.phases.push(phase);
        report.files.push(...phase.outputs.filter((p) => !report.files.includes(p)));
        // Carry forward taskIds so a re-poll sees the same ids
        // already in flight.
        for (const step of phase.steps) {
          if (step.taskId && !report.taskIds.includes(step.taskId)) {
            report.taskIds.push(step.taskId);
          }
        }
        opts.onPhaseUpdate?.(phase);
      }
    }
  }
  const isPhaseCarriedForward = (id: string) =>
    carriedForward.some((p) => p.phaseId === id);

  const aborted = () => Boolean(signal?.aborted);

  // ───────────── PHASE: preflight ─────────────
  const preflightPhase: ProductionRunPhase = {
    phaseId: 'preflight',
    title: 'Readiness and handoff intake',
    status: 'running',
    startedAt: nowIso(),
    steps: [],
    outputs: [],
  };
  pushPhase(preflightPhase);
  {
    const step = makeStep(
      `${comicBin} --preflight --json`,
      comicBin,
      ['--preflight', '--json']
    );
    preflightPhase.steps.push(step);
    if (dryRun) {
      step.exitCode = null;
      preflightPhase.status = 'done';
      preflightPhase.completedAt = nowIso();
    } else if (aborted()) {
      step.exitCode = null;
      step.stderr = 'aborted';
      preflightPhase.status = 'error';
      preflightPhase.error = 'aborted';
      preflightPhase.completedAt = nowIso();
    } else {
      const { result: r } = await runMmxJson(comicBin, step.args, signal);
      step.exitCode = r.exitCode;
      step.stdout = r.stdout;
      step.stderr = r.stderr;
      step.durationMs = r.durationMs;
      preflightPhase.status = r.aborted
        ? 'error'
        : r.exitCode === 0
          ? 'done'
          : 'error';
      if (preflightPhase.status === 'error' && r.aborted) {
        preflightPhase.error = 'aborted';
      } else if (preflightPhase.status === 'error') {
        preflightPhase.error = `comic-creator --preflight exited with code ${r.exitCode}`;
      }
      preflightPhase.completedAt = nowIso();
    }
    pushPhase(preflightPhase);
  }
  if (aborted() || preflightPhase.status === 'error') {
    return await finishReport(report, outputDir, slug);
  }

  // ───────────── PHASE: music-theme ─────────────
  const carriedMusic = isPhaseCarriedForward('music-theme')
    ? carriedForward.find((p) => p.phaseId === 'music-theme')
    : undefined;
  const musicPhase: ProductionRunPhase = {
    phaseId: 'music-theme',
    title: 'Generate or refine the theme song',
    status: carriedMusic ? 'done' : 'running',
    startedAt: carriedMusic ? carriedMusic.startedAt : nowIso(),
    // Preserve the carried-forward step list (which includes the
    // "reused from prior report" marker) — otherwise the
    // `pushPhase` below would overwrite the entry and the marker
    // would be lost.
    steps: carriedMusic ? carriedMusic.steps : [],
    outputs: carriedMusic ? carriedMusic.outputs : [],
  };
  pushPhase(musicPhase);
  if (!carriedMusic) {
    const musicPrompt =
      source.musicCuePackage.musicGenerationPrompt ||
      source.musicCuePackage.themeSongPrompt;
    const lyrics = source.musicCuePackage.songDraft.lyrics;
    const themeOut = join(outputDir, `${slug}-theme.mp3`);
    const args = [
      'music',
      'generate',
      '--prompt',
      musicPrompt,
      '--lyrics',
      lyrics,
      '--out',
      themeOut,
    ];
    const step = makeStep(`mmx music generate → ${themeOut}`, mmxBin, args);
    musicPhase.steps.push(step);
    if (dryRun) {
      step.exitCode = null;
      musicPhase.status = 'done';
      musicPhase.completedAt = nowIso();
      musicPhase.outputs.push(themeOut);
      report.files.push(themeOut);
    } else if (aborted()) {
      step.exitCode = null;
      step.stderr = 'aborted';
      musicPhase.status = 'error';
      musicPhase.error = 'aborted';
      musicPhase.completedAt = nowIso();
    } else {
      const { result: r } = await runMmxJson(mmxBin, args, signal);
      step.exitCode = r.exitCode;
      step.stdout = r.stdout;
      step.stderr = r.stderr;
      step.durationMs = r.durationMs;
      step.outputPath = themeOut;
      if (r.exitCode === 0) {
        musicPhase.status = 'done';
        musicPhase.outputs.push(themeOut);
        report.files.push(themeOut);
      } else {
        musicPhase.status = 'error';
        musicPhase.error = `mmx music generate exited with code ${r.exitCode}`;
      }
      musicPhase.completedAt = nowIso();
    }
    pushPhase(musicPhase);
  }
  if (aborted() || musicPhase.status === 'error') {
    return await finishReport(report, outputDir, slug);
  }

  // ───────────── PHASE: video-clips ─────────────
  const carriedVideo = isPhaseCarriedForward('video-clips')
    ? carriedForward.find((p) => p.phaseId === 'video-clips')
    : undefined;
  const videoPhase: ProductionRunPhase = {
    phaseId: 'video-clips',
    title: 'Generate actual motion clips',
    status: carriedVideo ? 'done' : 'running',
    startedAt: carriedVideo ? carriedVideo.startedAt : nowIso(),
    // Preserve the carried-forward step list (which includes the
    // "reused from prior report" marker) — otherwise the
    // `pushPhase` below would overwrite the entry and the marker
    // would be lost.
    steps: carriedVideo ? carriedVideo.steps : [],
    outputs: carriedVideo ? carriedVideo.outputs : [],
  };
  pushPhase(videoPhase);

  const clips = source.videoPackage.clips ?? [];
  if (carriedVideo) {
    // Skip the whole video-clips phase. The phase is already marked
    // done and its outputs are already in `report.files` from the
    // resume path above. We still need a `pushPhase` to update
    // completedAt so the WebUI's "phase done" event fires.
    videoPhase.completedAt = videoPhase.completedAt ?? nowIso();
    pushPhase(videoPhase);
  } else if (clips.length === 0) {
    videoPhase.status = 'skipped';
    videoPhase.error = 'no clips in video package';
    videoPhase.completedAt = nowIso();
    pushPhase(videoPhase);
  } else {
    let videoPhaseFailed = false;
    for (let i = 0; i < clips.length; i++) {
      if (aborted()) {
        videoPhaseFailed = true;
        break;
      }
      const clip = clips[i];
      const clipOut = join(outputDir, `${slug}-clip-${i + 1}.mp4`);

      // Step A: submit async, capture taskId
      const submitArgs = ['video', 'generate', '--prompt', clip.prompt, '--async'];
      const submitStep = makeStep(
        `mmx video generate (clip ${i + 1}/${clips.length})`,
        mmxBin,
        submitArgs
      );
      videoPhase.steps.push(submitStep);
      let taskId: string | undefined;
      if (dryRun) {
        taskId = `dry-run-clip-${i + 1}`;
        submitStep.taskId = taskId;
        report.taskIds.push(taskId);
      } else {
        const { result: r } = await runMmxJson(mmxBin, submitArgs, signal);
        submitStep.exitCode = r.exitCode;
        submitStep.stdout = r.stdout;
        submitStep.stderr = r.stderr;
        submitStep.durationMs = r.durationMs;
        if (r.exitCode !== 0) {
          videoPhaseFailed = true;
          break;
        }
        const parsed = parseAsyncSubmitJson(r.stdout);
        taskId = parsed.taskId;
        if (!taskId) {
          submitStep.stderr =
            (submitStep.stderr ?? '') + '\n[runner] could not parse task_id from mmx output';
          videoPhaseFailed = true;
          break;
        }
        submitStep.taskId = taskId;
        report.taskIds.push(taskId);
      }
      pushPhase(videoPhase);

      // Step B: poll task get until terminal
      const pollArgs = ['video', 'task', 'get', '--task-id', taskId!];
      const pollStep = makeStep(
        `mmx video task get (poll until done)`,
        mmxBin,
        pollArgs
      );
      videoPhase.steps.push(pollStep);
      let fileId: string | undefined;
      if (dryRun) {
        fileId = `dry-run-file-${i + 1}`;
        pollStep.fileId = fileId;
        pollStep.exitCode = 0;
        pollStep.durationMs = 0;
      } else {
        const started = Date.now();
        let polled: ParsedTaskStatus | null = null;
        let lastError: string | null = null;
        // Outer loop: polling. Inner: a single `task get` call.
        pollLoop: while (true) {
          if (aborted()) break pollLoop;
          const elapsed = (Date.now() - started) / 1000;
          if (elapsed > videoTimeoutSec) {
            lastError = `video task ${taskId} timed out after ${videoTimeoutSec}s`;
            break;
          }
          const { result: r } = await runMmxJson(mmxBin, pollArgs, signal);
          pollStep.exitCode = r.exitCode;
          pollStep.stdout = r.stdout;
          pollStep.stderr = r.stderr;
          pollStep.durationMs = r.durationMs;
          if (r.aborted) break pollLoop;
          if (r.exitCode !== 0) {
            lastError = `mmx video task get exited with code ${r.exitCode}`;
            break;
          }
          const parsed = parseTaskGetJson(r.stdout);
          if (parsed) {
            polled = parsed;
            if (parsed.fileId) {
              fileId = parsed.fileId;
              pollStep.fileId = fileId;
            }
            if (isTerminalVideoStatus(parsed.status)) break pollLoop;
          }
          await sleep(videoPollIntervalSec * 1000, signal);
        }
        if (!polled || !isSuccessfulVideoStatus(polled.status)) {
          videoPhaseFailed = true;
          if (!videoPhase.error) {
            videoPhase.error = lastError ?? `video task ${taskId} ended in status "${polled?.status ?? 'unknown'}"`;
          }
          break;
        }
      }
      pushPhase(videoPhase);

      // Step C: download
      if (!fileId) {
        videoPhaseFailed = true;
        if (!videoPhase.error) videoPhase.error = `no fileId for clip ${i + 1}`;
        break;
      }
      const dlArgs = ['video', 'download', '--file-id', fileId, '--out', clipOut];
      const dlStep = makeStep(`mmx video download → ${clipOut}`, mmxBin, dlArgs);
      videoPhase.steps.push(dlStep);
      if (dryRun) {
        dlStep.outputPath = clipOut;
        dlStep.exitCode = 0;
        videoPhase.outputs.push(clipOut);
        report.files.push(clipOut);
      } else {
        const { result: r } = await runMmxJson(mmxBin, dlArgs, signal);
        dlStep.exitCode = r.exitCode;
        dlStep.stdout = r.stdout;
        dlStep.stderr = r.stderr;
        dlStep.durationMs = r.durationMs;
        dlStep.outputPath = clipOut;
        if (r.exitCode === 0) {
          videoPhase.outputs.push(clipOut);
          report.files.push(clipOut);
        } else {
          videoPhaseFailed = true;
          if (!videoPhase.error) videoPhase.error = `mmx video download exited with code ${r.exitCode}`;
          break;
        }
      }
      pushPhase(videoPhase);
    }
    if (videoPhaseFailed && !videoPhase.error) videoPhase.error = 'aborted';
    videoPhase.status = aborted()
      ? 'error'
      : videoPhaseFailed
        ? 'error'
        : 'done';
    videoPhase.completedAt = nowIso();
    pushPhase(videoPhase);
  }
  if (aborted() || videoPhase.status === 'error') {
    return await finishReport(report, outputDir, slug);
  }

  // ───────────── PHASE: review-package ─────────────
  const reviewPhase: ProductionRunPhase = {
    phaseId: 'review-package',
    title: 'Review and package the production pass',
    status: 'running',
    startedAt: nowIso(),
    steps: [],
    outputs: [],
  };
  pushPhase(reviewPhase);
  {
    const reviewStep = makeStep(
      `summarize ${report.files.length} files`,
      'runner',
      ['summary']
    );
    reviewStep.exitCode = 0;
    reviewStep.stdout = JSON.stringify(
      {
        files: report.files,
        taskIds: report.taskIds,
        phaseSummary: report.phases.map((p) => ({ phaseId: p.phaseId, status: p.status, outputs: p.outputs })),
      },
      null,
      2
    );
    reviewPhase.steps.push(reviewStep);
    reviewPhase.outputs.push(join(outputDir, `${slug}-production-run-report.json`));
    reviewPhase.status = 'done';
    reviewPhase.completedAt = nowIso();
    pushPhase(reviewPhase);
  }

  return finishReport(report, outputDir, slug);
}

async function finishReport(
  report: ProductionRunReport,
  outputDir: string,
  slug: string
): Promise<ProductionRunReport> {
  report.completedAt = nowIso();
  // Best-effort write the report. Never throw — finishing must always
  // return the in-memory report so the caller can render it.
  try {
    const reportPath = join(outputDir, `${slug}-production-run-report.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    if (!report.files.includes(reportPath)) report.files.push(reportPath);
  } catch (err) {
    report.errors.push(
      `failed to write report: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return report;
}
