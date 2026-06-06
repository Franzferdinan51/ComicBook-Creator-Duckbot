import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProductionManifest } from './production-runner.js';
import type {
  ComicResult,
  ProductionRunManifest,
  VideoPackage,
  MusicCuePackage,
  SongDraft,
} from '../types.js';
import type { ProductionSource } from './production-runner.js';

function fakeComicResult(): ComicResult {
  const songDraft: SongDraft = {
    title: 'The Garden',
    genre: 'cinematic',
    mood: 'hopeful',
    bpm: 90,
    key: 'C major',
    instruments: 'acoustic guitar, piano, strings',
    structure: 'verse-chorus-verse-bridge-chorus',
    lyrics: '[Verse]\nA small robot walks\n[Chorus]\nAnd finds a garden',
    notes: [],
  };
  const musicCuePackage: MusicCuePackage = {
    cues: [],
    themeSongPrompt: 'cinematic hopeful, acoustic guitar, piano, building',
    musicGenerationPrompt: 'cinematic hopeful, acoustic guitar, piano, building',
    songDraft,
  };
  const videoPackage: VideoPackage = {
    clips: [
      {
        clipId: 'clip-1',
        prompt: 'A small robot walking through a city park at sunrise, cinematic, slow dolly forward.',
        durationSec: 6,
        notes: ['opening shot'],
      },
      {
        clipId: 'clip-2',
        prompt: 'The robot stops and looks at a small flower growing through concrete, close-up, shallow depth of field.',
        durationSec: 4,
        notes: ['discovery beat'],
      },
    ],
    notes: [],
  };
  // We only need a few fields populated for the runner — the rest can
  // be minimal stubs.
  return {
    script: { title: 'The Robot Garden', artStyle: 'manga', pages: [] },
    pages: [],
    projectPath: null,
    outputPath: null,
    studioBundlePath: null,
    agentGuidancePath: null,
    agentGuidancePackage: { format: 'agent-guidance', sections: [], recommendations: [] },
    agentPlaybookPath: null,
    project: {} as never,
    storyBible: {} as never,
    adaptationPackage: {} as never,
    seriesPackage: {} as never,
    trailerPackage: {} as never,
    videoPackage,
    musicCuePackage,
    musicCuePackagePath: null,
    songSheetPath: null,
    songAudioPath: null,
    musicProvider: 'mock',
    storyboardPackagePath: null,
    trailerPackagePath: null,
    videoPackagePath: null,
    seriesPackagePath: null,
    animaticTimelinePath: null,
    agentWorkflowPackage: {} as never,
    agentWorkflowPackagePath: null,
    productionRunManifest: {} as never,
    productionRunManifestPath: null,
    screenplayPath: null,
    directorBriefPath: null,
  };
}

function fakeManifest(result: ProductionSource): ProductionRunManifest {
  return {
    format: 'production-run-manifest',
    provider: 'minimax',
    jobId: 'job-123',
    title: result.script.title,
    projectGoal: 'comic',
    entrypoints: {
      studioBundlePath: null,
      agentWorkflowPackagePath: null,
      videoPackagePath: null,
      musicCuePackagePath: null,
      animaticTimelinePath: null,
      themeAudioPath: null,
    },
    gates: [],
    phases: [],
    agentInstructions: { hermes: '', openClaw: '', externalAgent: '' },
    reviewChecklist: [],
  };
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'prod-runner-test-'));
  return dir;
}

/** A fake `mmx` and `comic-creator` that record their argv and return
 *  canned responses. We write a tiny shell script that mimics the parts
 *  of the real CLI that the runner depends on:
 *  - `mmx music generate ... --out <path> --output json` → echoes a JSON
 *    stub, then creates the file at <path>.
 *  - `mmx video generate --prompt ... --async --output json` → echoes a
 *    JSON with a fake task_id.
 *  - `mmx video task get --task-id <id> --output json` → echoes a JSON
 *    with a fake file_id and status=Success on the 2nd poll, "Running"
 *    on the first.
 *  - `mmx video download --file-id <id> --out <path> --output json` →
 *    creates a file at <path>.
 *  - `comic-creator --preflight --json` → echoes a JSON stub with status=pass.
 */
async function installFakeBinaries(dir: string): Promise<{ mmx: string; comic: string }> {
  const bin = join(dir, 'bin');
  await mkdir(bin, { recursive: true });
  const stateDir = join(dir, 'state');
  await mkdir(stateDir, { recursive: true });
  const stateFile = join(stateDir, 'poll-count.json');
  await writeFile(stateFile, '{}', 'utf8');

  const mmxPath = join(bin, 'mmx');
  const mmxScript = `#!/usr/bin/env bash
set -e
STATE_FILE="${stateFile}"
# Last "command" is the first positional; pick the resource.
case "$1" in
  music)
    shift
    case "$1" in
      generate)
        shift
        OUT=""
        PROMPT=""
        for ((i=1; i<=$#; i++)); do
          case "\${!i}" in
            --out) NEXT=$((i+1)); OUT="\${!NEXT}"; i=$((i+1));;
            --prompt) NEXT=$((i+1)); PROMPT="\${!NEXT}"; i=$((i+1));;
          esac
        done
        if [ -n "$OUT" ]; then
          mkdir -p "$(dirname "$OUT")"
          echo "fake-mp3" > "$OUT"
        fi
        printf '%s\\n' "{\\"status\\":\\"success\\",\\"file\\":\\"$OUT\\",\\"prompt\\":\\"$PROMPT\\"}"
        exit 0
        ;;
    esac
    ;;
  video)
    shift
    case "$1" in
      generate)
        shift
        if [[ " $* " == *" --async "* ]]; then
          TASK_ID="task-\\$(date +%s%N)"
          printf '%s\\n' "{\\"task_id\\":\\"$TASK_ID\\",\\"status\\":\\"queued\\"}"
          exit 0
        fi
        printf '%s\\n' "{\\"error\\":\\"sync mode not supported by fake mmx\\"}"
        exit 1
        ;;
      task)
        shift
        case "$1" in
          get)
            shift
            TASK_ID=""
            for ((i=1; i<=$#; i++)); do
              case "\${!i}" in
                --task-id) NEXT=$((i+1)); TASK_ID="\${!NEXT}"; i=$((i+1));;
              esac
            done
            COUNT_FILE="$STATE_FILE.$TASK_ID"
            if [ -f "$COUNT_FILE" ]; then
              N=$(cat "$COUNT_FILE")
            else
              N=0
            fi
            N=$((N + 1))
            echo "$N" > "$COUNT_FILE"
            if [ "$N" -ge 2 ]; then
              printf '%s\\n' "{\\"task_id\\":\\"$TASK_ID\\",\\"status\\":\\"Success\\",\\"file_id\\":\\"file-$TASK_ID\\"}"
            else
              printf '%s\\n' "{\\"task_id\\":\\"$TASK_ID\\",\\"status\\":\\"Running\\"}"
            fi
            exit 0
            ;;
        esac
        ;;
      download)
        shift
        OUT=""
        FILE_ID=""
        for ((i=1; i<=$#; i++)); do
          case "\${!i}" in
            --out) NEXT=$((i+1)); OUT="\${!NEXT}"; i=$((i+1));;
            --file-id) NEXT=$((i+1)); FILE_ID="\${!NEXT}"; i=$((i+1));;
          esac
        done
        if [ -n "$OUT" ]; then
          mkdir -p "$(dirname "$OUT")"
          echo "fake-mp4-$FILE_ID" > "$OUT"
        fi
        printf '%s\\n' "{\\"status\\":\\"success\\",\\"file\\":\\"$OUT\\"}"
        exit 0
        ;;
    esac
    ;;
esac
printf '%s\\n' "{\\"error\\":\\"unknown command: $*\\"}"
exit 2
`;
  await writeFile(mmxPath, mmxScript, { mode: 0o755 });

  const comicPath = join(bin, 'comic-creator');
  const comicScript = `#!/usr/bin/env bash
printf '%s\\n' "{\\"status\\":\\"pass\\",\\"checks\\":[]}"
exit 0
`;
  await writeFile(comicPath, comicScript, { mode: 0o755 });

  return { mmx: mmxPath, comic: comicPath };
}

async function testDryRun(): Promise<void> {
  const tmp = await makeTempDir();
  try {
    const result = fakeComicResult();
    const manifest = fakeManifest(result);
    const { mmx, comic } = await installFakeBinaries(tmp);
    const outDir = join(tmp, 'out');
    const report = await runProductionManifest(manifest, result, {
      outputDir: outDir,
      mmxBin: mmx,
      comicCreatorBin: comic,
      dryRun: true,
    });
    assert.equal(report.dryRun, true);
    assert.equal(report.phases.length, 4);
    assert.equal(report.phases[0].phaseId, 'preflight');
    assert.equal(report.phases[0].status, 'done');
    assert.equal(report.phases[1].phaseId, 'music-theme');
    assert.equal(report.phases[1].status, 'done');
    assert.equal(report.phases[2].phaseId, 'video-clips');
    assert.equal(report.phases[2].status, 'done');
    assert.equal(report.phases[3].phaseId, 'review-package');
    assert.equal(report.phases[3].status, 'done');
    // Dry-run records what files *would* be created so the WebUI
    // can preview the plan, but doesn't actually invoke mmx.
    // 3 planned (theme + 2 clips) + 1 review-report path written by
    // finishReport = 4.
    assert.equal(report.files.length, 4);
    assert.equal(report.taskIds.length, 2);
    // No real files on disk for dry-run music/video (we only
    // planned the report itself).
    const reviewPhase = report.phases[3];
    assert.equal(reviewPhase.status, 'done');
    const summaryStep = reviewPhase.steps[0];
    // Summary step stdout should reflect the dry-run plan.
    assert.match(summaryStep.stdout, /phaseSummary/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function testFullRun(): Promise<void> {
  const tmp = await makeTempDir();
  try {
    const result = fakeComicResult();
    const manifest = fakeManifest(result);
    const { mmx, comic } = await installFakeBinaries(tmp);
    const outDir = join(tmp, 'out');
    const phaseUpdates: string[] = [];
    const report = await runProductionManifest(manifest, result, {
      outputDir: outDir,
      mmxBin: mmx,
      comicCreatorBin: comic,
      videoPollIntervalSec: 0, // speed up tests
      onPhaseUpdate: (p) => phaseUpdates.push(`${p.phaseId}:${p.status}`),
    });
    assert.equal(report.dryRun, false);
    assert.equal(report.phases.length, 4);
    for (const p of report.phases) {
      assert.equal(p.status, 'done', `phase ${p.phaseId} should be done, got ${p.status}${p.error ? ': ' + p.error : ''}`);
    }
    // Music: one step, one output file
    const musicPhase = report.phases[1];
    assert.equal(musicPhase.phaseId, 'music-theme');
    assert.equal(musicPhase.steps.length, 1);
    assert.equal(musicPhase.steps[0].cmd, mmx);
    assert.match(musicPhase.steps[0].args.join(' '), /music generate/);
    assert.equal(musicPhase.outputs.length, 1);
    // Video: 2 clips × 3 steps each = 6 steps, 2 output files
    const videoPhase = report.phases[2];
    assert.equal(videoPhase.phaseId, 'video-clips');
    assert.equal(videoPhase.steps.length, 6);
    assert.equal(videoPhase.outputs.length, 2);
    assert.equal(report.taskIds.length, 2);
    assert.match(report.taskIds[0], /^task-/);
    // Confirm step 1 of clip 1 captured the submit taskId
    const submitStep = videoPhase.steps[0];
    assert.match(submitStep.taskId ?? '', /^task-/);
    // Confirm step 2 captured the fileId (after the 2nd poll)
    const pollStep = videoPhase.steps[1];
    assert.match(pollStep.fileId ?? '', /^file-task-/);
    // Confirm step 3 wrote the clip
    const dlStep = videoPhase.steps[2];
    assert.match(dlStep.outputPath ?? '', /the-robot-garden-clip-1\.mp4$/);
    // Files: 1 music + 2 videos + 1 report = 4
    assert.equal(report.files.length, 4);
    // Report file should exist on disk
    const reportOnDisk = join(outDir, 'the-robot-garden-production-run-report.json');
    const written = JSON.parse(await readFile(reportOnDisk, 'utf8')) as { manifest: { jobId: string }; phases: unknown[] };
    assert.equal(written.manifest.jobId, 'job-123');
    assert.equal(written.phases.length, 4);
    // onPhaseUpdate was called at least once per phase
    const seen = new Set(phaseUpdates.map((s) => s.split(':')[0]));
    assert.equal(seen.size, 4, `expected updates for all 4 phases, got ${[...seen].join(',')}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function testAbortStopsRemainingPhases(): Promise<void> {
  const tmp = await makeTempDir();
  try {
    const result = fakeComicResult();
    const manifest = fakeManifest(result);
    const { mmx, comic } = await installFakeBinaries(tmp);
    const outDir = join(tmp, 'out');
    const controller = new AbortController();
    // Abort before kicking off the run — preflight should be marked
    // error and the rest of the phases should never run.
    controller.abort();
    const report = await runProductionManifest(manifest, result, {
      outputDir: outDir,
      mmxBin: mmx,
      comicCreatorBin: comic,
      videoPollIntervalSec: 0,
      signal: controller.signal,
    });
    assert.equal(report.phases[0].status, 'error');
    assert.equal(report.phases[0].error, 'aborted');
    // Music/video/review should be missing entirely (we only push
    // phase entries when we actually start them).
    assert.equal(report.phases.length, 1);
    assert.equal(report.errors.length, 0);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function testEmptyClipsListMarksVideoPhaseSkipped(): Promise<void> {
  const tmp = await makeTempDir();
  try {
    const result = fakeComicResult();
    result.videoPackage.clips = [];
    const manifest = fakeManifest(result);
    const { mmx, comic } = await installFakeBinaries(tmp);
    const outDir = join(tmp, 'out');
    const report = await runProductionManifest(manifest, result, {
      outputDir: outDir,
      mmxBin: mmx,
      comicCreatorBin: comic,
      videoPollIntervalSec: 0,
    });
    assert.equal(report.phases[2].status, 'skipped');
    assert.match(report.phases[2].error ?? '', /no clips/i);
    // Review phase should still be done
    assert.equal(report.phases[3].status, 'done');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function testChildFailureMarksPhaseError(): Promise<void> {
  const tmp = await makeTempDir();
  try {
    const result = fakeComicResult();
    const manifest = fakeManifest(result);
    // Write a comic-creator that exits 1 on preflight.
    const bin = join(tmp, 'bin-fail');
    await mkdir(bin, { recursive: true });
    const failScript = `#!/usr/bin/env bash
printf 'simulated failure\\n' >&2
exit 1
`;
    await writeFile(join(bin, 'mmx'), failScript, { mode: 0o755 });
    await writeFile(join(bin, 'comic-creator'), failScript, { mode: 0o755 });
    const outDir = join(tmp, 'out');
    const report = await runProductionManifest(manifest, result, {
      outputDir: outDir,
      mmxBin: join(bin, 'mmx'),
      comicCreatorBin: join(bin, 'comic-creator'),
      videoPollIntervalSec: 0,
    });
    assert.equal(report.phases[0].status, 'error');
    assert.match(report.phases[0].error ?? '', /exited with code 1/);
    // Music phase should never have started.
    assert.equal(report.phases.length, 1);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

await testDryRun();
await testFullRun();
await testAbortStopsRemainingPhases();
await testEmptyClipsListMarksVideoPhaseSkipped();
await testChildFailureMarksPhaseError();

console.log('PASS production-runner');
