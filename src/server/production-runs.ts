import type { ProductionRunPhase, ProductionRunReport } from '../types.js';

export type ProductionRunStatus = 'pending' | 'running' | 'done' | 'error' | 'aborted';

/**
 * Per-run mutable record the server exposes while a production run
 * is in flight. Mirrors the same `phase` snapshot the runner pushes
 * via `onPhaseUpdate`, so polling clients can render a live progress
 * bar without re-fetching the whole report.
 */
export interface ProductionRunRecord {
  runId: string;
  jobId: string;
  status: ProductionRunStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  dryRun: boolean;
  outputDir: string;
  phases: ProductionRunPhase[];
  /** Set when status flips to `done`. */
  report: ProductionRunReport | null;
  /** Set when status flips to `error` or `aborted`. */
  error: string | null;
}

/**
 * FIFO-capped in-memory tracker for in-flight production runs.
 * Mirrors the JobManager's storage pattern — the WebUI polls
 * `/api/production-run/:runId` and the route reads from here.
 */
export class ProductionRunManager {
  private runs = new Map<string, ProductionRunRecord>();
  private maxRecords: number;

  constructor(maxRecords = 50) {
    this.maxRecords = maxRecords;
  }

  create(input: {
    runId: string;
    jobId: string;
    outputDir: string;
    dryRun: boolean;
  }): ProductionRunRecord {
    const record: ProductionRunRecord = {
      runId: input.runId,
      jobId: input.jobId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      dryRun: input.dryRun,
      outputDir: input.outputDir,
      phases: [],
      report: null,
      error: null,
    };
    this.runs.set(input.runId, record);
    this.trim();
    return record;
  }

  get(runId: string): ProductionRunRecord | undefined {
    return this.runs.get(runId);
  }

  /** Return all run records for a given jobId, newest first. Used by
   *  the GET /api/comic/:jobId/production-run-report route to find
   *  the most recent run even when the user passed a custom
   *  `--run-production-out=` directory. */
  listForJob(jobId: string): ProductionRunRecord[] {
    const out: ProductionRunRecord[] = [];
    for (const r of this.runs.values()) {
      if (r.jobId === jobId) out.push(r);
    }
    // Newest first. createdAt is ISO so lexical sort works.
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return out;
  }

  /** Update the record from a runner phase event. Called from the
   *  runner's `onPhaseUpdate` callback. */
  updatePhase(runId: string, phase: ProductionRunPhase): void {
    const r = this.runs.get(runId);
    if (!r) return;
    const idx = r.phases.findIndex((p) => p.phaseId === phase.phaseId);
    if (idx < 0) r.phases.push(phase);
    else r.phases[idx] = phase;
    if (r.status === 'pending') {
      r.status = 'running';
      r.startedAt = new Date().toISOString();
    }
  }

  markDone(runId: string, report: ProductionRunReport): void {
    const r = this.runs.get(runId);
    if (!r) return;
    r.status = 'done';
    r.completedAt = new Date().toISOString();
    r.report = report;
  }

  markError(runId: string, error: string): void {
    const r = this.runs.get(runId);
    if (!r) return;
    r.status = 'error';
    r.completedAt = new Date().toISOString();
    r.error = error;
  }

  private trim(): void {
    while (this.runs.size > this.maxRecords) {
      const firstKey = this.runs.keys().next().value;
      if (firstKey === undefined) break;
      this.runs.delete(firstKey);
    }
  }
}

let singleton: ProductionRunManager | null = null;
export function getProductionRunManager(): ProductionRunManager {
  if (!singleton) singleton = new ProductionRunManager();
  return singleton;
}

/** Test-only: drop the singleton so the next `getProductionRunManager()`
 *  call returns a fresh instance. The runner tests rely on this. */
export function _resetProductionRunManager(): void {
  singleton = null;
}
