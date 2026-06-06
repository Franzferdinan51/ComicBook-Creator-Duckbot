/**
 * Stage list for the comic-creator pipeline. Shared between
 * `src/index.ts` (which emits events) and `src/server/jobs.ts` (which
 * forwards them to polling clients). Stages are intentionally coarse:
 * fine-grained per-panel progress would require plumbing a callback
 * through `generatePanelImages()`, which we don't have today.
 *
 * Weights sum to 1.0 — the WebUI uses them to compare fractions
 * across stage boundaries (so the ETA line doesn't jump backwards
 * when the pipeline moves from the script stage to the image stage).
 */

export interface JobProgressStage {
  id: 'script' | 'images' | 'assembly' | 'packaging';
  label: string;
  weight: number;
}

export const JOB_PROGRESS_STAGES: ReadonlyArray<JobProgressStage> = [
  { id: 'script', label: 'Generating script', weight: 0.15 },
  { id: 'images', label: 'Creating panel art', weight: 0.7 },
  { id: 'assembly', label: 'Assembling PDF', weight: 0.05 },
  { id: 'packaging', label: 'Writing artifacts', weight: 0.1 },
];

/** Latest progress event for a running job. */
export interface JobProgress {
  stage: JobProgressStage['id'] | 'idle' | 'writing';
  label: string;
  fraction: number;
  emittedAt: string;
}
