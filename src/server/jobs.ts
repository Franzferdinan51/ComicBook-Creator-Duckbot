/**
 * comic-creator server — in-memory job manager.
 *
 * Jobs are short-lived, in-memory records that track the status of one
 * `createComic()` invocation. They survive across HTTP requests for as long
 * as the process runs. On restart, in-flight jobs are lost (the frontend
 * can re-create them via POST /api/comic).
 *
 * The job also stores the *full* `ComicResult` once it's done, so the
 * routes can stream the PDF and individual panel images without
 * re-running the pipeline.
 *
 * The job manager is intentionally a singleton (module-level state) — the
 * Express app just calls `getJobManager()` to share one instance.
 */

import { randomUUID } from 'node:crypto';
import { createComic } from '../index.js';
import type { ComicOptions, ComicResult } from '../types.js';
import { upsertHistoryEntry, type HistoryEntry } from './storage.js';

export type JobStatus = 'pending' | 'done' | 'error';

export interface JobRecord {
  jobId: string;
  story: string;
  options: ComicOptions;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  /** Set when status === 'done'. */
  result?: ComicResult;
  /** Set when status === 'error'. */
  error?: string;
  /** Used to cancel a long-running job. */
  abortController: AbortController;
}

export interface CreateJobInput {
  story: string;
  options?: ComicOptions;
  /** If supplied, uses this id (for regenerate). Otherwise generates a new one. */
  jobId?: string;
}

/** Maximum number of in-memory job records. Older finished jobs are
 *  pruned from the map (FIFO) once the cap is hit. The full result is
 *  always in history.json on disk — the in-memory record only needs to
 *  stay around long enough for the front-end to poll the PDF/images
 *  endpoints. */
const MAX_IN_MEMORY_JOBS = 200;

class JobManager {
  private jobs = new Map<string, JobRecord>();
  /** Insertion order for FIFO eviction. Mirrors this.jobs's keys. */
  private insertionOrder: string[] = [];

  /** Create and start a new job. Returns the new job record. */
  createAndStart(input: CreateJobInput): JobRecord {
    const jobId = input.jobId ?? randomUUID();
    const now = new Date().toISOString();
    const record: JobRecord = {
      jobId,
      story: input.story,
      options: input.options ?? {},
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      abortController: new AbortController(),
    };
    this.jobs.set(jobId, record);
    this.insertionOrder.push(jobId);

    // Evict the oldest entries until we're under the cap. Eviction
    // keeps `insertionOrder` in sync.
    while (this.jobs.size > MAX_IN_MEMORY_JOBS && this.insertionOrder.length > 0) {
      const oldest = this.insertionOrder.shift();
      if (oldest) this.jobs.delete(oldest);
    }

    // Fire-and-forget — but we catch errors so they don't escape as
    // unhandled rejections.
    void this.run(record).catch((err) => {
      // Defensive — run() should always set the status itself.
      console.error(`[jobs] unhandled error for ${jobId}:`, err);
      record.status = 'error';
      record.error = (err as Error).message;
      record.updatedAt = new Date().toISOString();
    });

    return record;
  }

  /** Look up a job. */
  get(jobId: string): JobRecord | undefined {
    return this.jobs.get(jobId);
  }

  /** List all known jobs, newest first. */
  list(): JobRecord[] {
    return Array.from(this.jobs.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  /** Remove a job from the in-memory map. */
  delete(jobId: string): boolean {
    const i = this.insertionOrder.indexOf(jobId);
    if (i >= 0) this.insertionOrder.splice(i, 1);
    return this.jobs.delete(jobId);
  }

  /** Cancel a job in progress. */
  cancel(jobId: string): boolean {
    const record = this.jobs.get(jobId);
    if (!record) return false;
    record.abortController.abort();
    return true;
  }

  /** Internal: actually run createComic and update the record. */
  private async run(record: JobRecord): Promise<void> {
    try {
      const result = await createComic(record.story, record.options ?? {});
      record.result = result;
      record.status = 'done';
      record.updatedAt = new Date().toISOString();

      // Best-effort: append to history. If disk is broken, log and continue.
      const entry: HistoryEntry = {
        jobId: record.jobId,
        title: result.script.title,
        createdAt: record.createdAt,
        artStyle: result.script.artStyle,
        pageCount: result.script.pages.length,
        outputPath: result.outputPath,
        scriptJson: result.script,
      };
      try {
        await upsertHistoryEntry(entry);
      } catch (err) {
        console.warn(
          `[jobs] failed to persist history for ${record.jobId}: ${(err as Error).message}`
        );
      }
    } catch (err) {
      console.error(`[jobs] run failed for ${record.jobId}:`, err);
      record.status = 'error';
      record.error = (err as Error).message;
      record.updatedAt = new Date().toISOString();
    }
  }
}

// Module-level singleton
let _manager: JobManager | null = null;

/** Get the singleton JobManager. */
export function getJobManager(): JobManager {
  if (!_manager) _manager = new JobManager();
  return _manager;
}

/** Test helper: replace the singleton with a fresh instance. */
export function _resetJobManager(): void {
  _manager = new JobManager();
}
