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
import { join } from 'node:path';
import type { ComicOptions, ComicResult, StoryProject } from '../types.js';
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

/**
 * A "result-ish" view of a job that the route layer can consume
 * regardless of whether the job is still in memory or has been
 * evicted (server restart, FIFO trim) and is only available in the
 * on-disk history. Status is always 'done' for the history path —
 * the in-memory record is the only thing that can report 'pending'
 * or 'error'.
 */
export interface ResolvedJob {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  result: ComicResult;
  error?: string;
  /** True if this was synthesized from on-disk history. The
   *  `abortController` is undefined and the story/options are
   *  unavailable — so don't try to cancel or regenerate from
   *  history-resolved records. */
  fromHistory: boolean;
}

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

  /**
   * Resolve a jobId to a `ResolvedJob` view. If the live in-memory
   * record exists, returns it. Otherwise falls back to history.json
   * on disk — rehydrating enough state to serve the PDF/CBZ/image
   * routes. Returns undefined if neither source has the job.
   *
   * The history fallback exists so that a server restart, a 200-job
   * FIFO trim, or even a deploy doesn't turn every old jobId in the
   * browser into a 404. Old jobs that finished in a previous
   * process keep working as long as their output files are on disk.
   */
  async resolve(jobId: string): Promise<ResolvedJob | undefined> {
    const live = this.jobs.get(jobId);
    if (live) {
      return {
        jobId: live.jobId,
        status: live.status,
        createdAt: live.createdAt,
        updatedAt: live.updatedAt,
        result: live.result as ComicResult,
        error: live.error,
        fromHistory: false,
      };
    }
    // Fall back to on-disk history. The result is reconstructed
    // from what we persisted: the script (so the page tree is
    // available to the frontend) and the output paths (so the
    // PDF/CBZ/image routes can stream the files). Anything that
    // requires the live `story` or `options` (regenerate, cancel)
    // is NOT available — callers should check `fromHistory` and
    // degrade gracefully.
    const { findHistoryEntry } = await import('./storage.js');
    const entry = await findHistoryEntry(jobId);
    if (!entry) return undefined;
    // Build a minimal ComicResult shape. panelImagePaths can be
    // reconstructed by scanning the per-job images dir next to the
    // outputPath (we always write one file per panel there).
    const projectGoal = entry.project?.projectGoal ?? 'comic';
    const fallbackProject: StoryProject = {
      id: jobId,
      title: entry.scriptJson.title,
      premise: entry.scriptJson.title,
      artStyle: entry.scriptJson.artStyle,
      projectGoal,
      renderProfile: {
        outputProfile: 'comic-print',
        page: { width: 825, height: 1275, margin: 36, bleed: 18 },
        panel: { aspectRatio: '2:3', targetWidth: 1024, targetHeight: 1536, fit: 'contain' },
        cover: { width: 1536, height: 2304, aspectRatio: '2:3' },
      },
      storyBible: {
        premise: entry.scriptJson.title,
        synopsis: `${entry.scriptJson.title} recovered from history.`,
        chapterOutline: [],
        sceneBeats: [],
      },
      adaptationPackage: {
        format: 'screen-outline',
        sceneOutline: [],
        screenplayScenes: [],
        storyboardPrompts: [],
      },
      musicCuePackage: {
        format: 'music-brief',
        cues: [],
        sceneCueMap: [],
        songDraft: {
          title: `${entry.scriptJson.title} Theme`,
          genre: 'cinematic pop',
          bpm: 96,
          key: 'A minor',
          sections: [],
          lyrics: '',
        },
        themeSongPrompt: `Create a theme for "${entry.scriptJson.title}".`,
        musicGenerationPrompt: `Generate a cinematic music theme for "${entry.scriptJson.title}" with instrumentation that supports the comic's adaptation scenes.`,
      },
      agentGuidancePackage: {
        format: 'agent-guidance',
        frameworks: {
          hermesAgent: {
            repository: 'https://github.com/nousresearch/hermes-agent',
            role: 'Long-horizon creative planning, task routing, and multi-step operator orchestration.',
          },
          openClaw: {
            repository: 'https://github.com/openclaw/openclaw',
            role: 'Tool-connected execution layer for generation, external model access, and local workflow control.',
          },
        },
        workflowSteps: [],
        deliverables: [],
        operatorChecklist: [],
        externalInterfaces: ['cli', 'mcp', 'webui', 'external-agent'],
        systemPrompt: `Support "${entry.scriptJson.title}" as a reusable studio project with a ${projectGoal} focus.`,
      },
    };
    const project: StoryProject = entry.project
      ? { ...entry.project, projectGoal: entry.project.projectGoal ?? projectGoal }
      : fallbackProject;
    const result: ComicResult = {
      script: entry.scriptJson,
      outputPath: entry.outputPath,
      pdfPath: entry.pdfPath ?? (entry.outputPath.endsWith('.pdf') ? entry.outputPath : null),
      cbzPath: entry.cbzPath ?? (entry.outputPath.endsWith('.cbz') ? entry.outputPath : null),
      coverImagePath: entry.coverImagePath ?? null,
      studioBundlePath: entry.studioBundlePath ?? `${entry.outputPath.replace(/\.[^./\\]+$/, '')}-studio-bundle.json`,
      project,
      projectPath: entry.projectPath ?? null,
      agentPlaybookPath: entry.agentPlaybookPath ?? join(process.cwd(), 'docs', 'agents', 'hermes-openclaw-playbook.md'),
      storyBible: entry.project?.storyBible ?? {
        premise: entry.scriptJson.title,
        synopsis: `${entry.scriptJson.title} recovered from history.`,
        chapterOutline: [],
        sceneBeats: [],
      },
      adaptationPackage: entry.adaptationPackage ?? entry.project?.adaptationPackage ?? {
        format: 'screen-outline',
        sceneOutline: [],
        screenplayScenes: [],
        storyboardPrompts: [],
      },
      musicCuePackage: entry.musicCuePackage ?? entry.project?.musicCuePackage ?? {
        format: 'music-brief',
        cues: [],
        sceneCueMap: [],
        songDraft: {
          title: `${entry.scriptJson.title} Theme`,
          genre: 'cinematic pop',
          bpm: 96,
          key: 'A minor',
          sections: [],
          lyrics: '',
        },
        themeSongPrompt: `Create a theme for "${entry.scriptJson.title}".`,
        musicGenerationPrompt: `Generate a cinematic music theme for "${entry.scriptJson.title}" with instrumentation that supports the comic's adaptation scenes.`,
      },
      agentGuidancePackage: entry.agentGuidancePackage ?? entry.project?.agentGuidancePackage ?? {
        format: 'agent-guidance',
        frameworks: {
          hermesAgent: {
            repository: 'https://github.com/nousresearch/hermes-agent',
            role: 'Long-horizon creative planning, task routing, and multi-step operator orchestration.',
          },
          openClaw: {
            repository: 'https://github.com/openclaw/openclaw',
            role: 'Tool-connected execution layer for generation, external model access, and local workflow control.',
          },
        },
        workflowSteps: [],
        deliverables: [],
        operatorChecklist: [],
        externalInterfaces: ['cli', 'mcp', 'webui', 'external-agent'],
        systemPrompt: `Support "${entry.scriptJson.title}" as a reusable studio project.`,
      },
      agentGuidancePath: entry.agentGuidancePath ?? null,
      songSheetPath: entry.songSheetPath ?? null,
      songAudioPath: entry.songAudioPath ?? null,
      musicProvider: entry.musicProvider ?? 'mock',
      storyboardPackagePath: entry.storyboardPackagePath ?? null,
      animaticTimelinePath: entry.animaticTimelinePath ?? null,
      pages: await Promise.all(
        entry.scriptJson.pages.map(async (page) => {
          // The images dir is the outputPath with extension replaced
          // by `.images/`. Best-effort: if the dir doesn't exist,
          // return an empty paths array.
          const stem = entry.outputPath.replace(/\.[^./\\]+$/, '');
          const imageDir = `${stem}.images`;
          const panelImagePaths: string[] = [];
          for (const panel of page.panels) {
            for (const ext of ['jpg', 'png']) {
              const candidate = `${imageDir}/${panel.id}.${ext}`;
              try {
                await (await import('node:fs/promises')).access(candidate);
                panelImagePaths.push(candidate);
                break;
              } catch {
                // try next ext
              }
            }
          }
          return {
            page,
            imagePath: panelImagePaths[0] ?? '',
            panelImagePaths,
            layout: page.layout,
          };
        })
      ),
    };
    return {
      jobId,
      status: 'done',
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
      result,
      fromHistory: true,
    };
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
      const { createComic } = await import('../index.js');
      const result = await createComic(record.story, record.options ?? {});
      record.result = result;

      // Best-effort: append to history. If disk is broken, log and continue.
      const entry: HistoryEntry = {
        jobId: record.jobId,
        title: result.script.title,
        createdAt: record.createdAt,
        artStyle: result.script.artStyle,
        pageCount: result.script.pages.length,
        outputPath: result.outputPath,
        pdfPath: result.pdfPath ?? undefined,
        cbzPath: result.cbzPath ?? undefined,
        coverImagePath: result.coverImagePath ?? undefined,
        project: result.project,
        projectPath: result.projectPath ?? undefined,
        agentPlaybookPath: result.agentPlaybookPath ?? undefined,
        adaptationPackage: result.adaptationPackage,
        musicCuePackage: result.musicCuePackage,
        agentGuidancePackage: result.agentGuidancePackage,
        agentGuidancePath: result.agentGuidancePath ?? undefined,
        songSheetPath: result.songSheetPath ?? undefined,
        songAudioPath: result.songAudioPath ?? undefined,
        musicProvider: result.musicProvider,
        storyboardPackagePath: result.storyboardPackagePath ?? undefined,
        animaticTimelinePath: result.animaticTimelinePath ?? undefined,
        studioBundlePath: result.studioBundlePath ?? undefined,
        scriptJson: result.script,
      };
      try {
        await upsertHistoryEntry(entry);
      } catch (err) {
        console.warn(
          `[jobs] failed to persist history for ${record.jobId}: ${(err as Error).message}`
        );
      }
      record.status = 'done';
      record.updatedAt = new Date().toISOString();
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
