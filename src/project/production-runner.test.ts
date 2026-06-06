import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
    // Phases are required by the resume path — `carryForwardPhases`
    // filters prior phases by their `phaseId` membership in the
    // manifest's `phases` list. Without this, the resume machinery
    // is a no-op.
    phases: [
      { phaseId: 'preflight', title: 'p', objective: '', commands: [], dependsOn: [], outputs: [], verification: [] },
      { phaseId: 'music-theme', title: 'm', objective: '', commands: [], dependsOn: [], outputs: [], verification: [] },
      { phaseId: 'video-clips', title: 'v', objective: '', commands: [], dependsOn: [], outputs: [], verification: [] },
      { phaseId: 'review-package', title: 'r', objective: '', commands: [], dependsOn: [], outputs: [], verification: [] },
    ],
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
await testResumeSkipsCompletedPhases();
await testResumeReRunsErroredPhase();
await testResumeWithoutPriorReportJustRunsNormally();
await testResumeIsIgnoredInDryRun();

console.log('PASS production-runner');

async function testResumeSkipsCompletedPhases(): Promise<void> {
  const tmp = await makeTempDir();
  try {
    const result = fakeComicResult();
    const manifest = fakeManifest(result);
    const { mmx, comic } = await installFakeBinaries(tmp);
    const outDir = join(tmp, 'out');
    // First run: full real run, writes report.
    const first = await runProductionManifest(manifest, result, {
      outputDir: outDir,
      mmxBin: mmx,
      comicCreatorBin: comic,
      videoPollIntervalSec: 0,
    });
    for (const p of first.phases) assert.equal(p.status, 'done');
    // Second run with resume=true and a sentinel mmx that fails on
    // music generate so we can prove the runner didn't actually
    // re-invoke it.
    const binSentinel = join(tmp, 'bin-sentinel');
    await mkdir(binSentinel, { recursive: true });
    await writeFile(
      join(binSentinel, 'comic-creator'),
      `#!/usr/bin/env bash
printf '%s\\n' "{\\"status\\":\\"pass\\"}"
exit 0
`,
      { mode: 0o755 }
    );
    await writeFile(
      join(binSentinel, 'mmx'),
      `#!/usr/bin/env bash
printf 'this should never run during resume\\n' >&2
exit 99
`,
      { mode: 0o755 }
    );
    const second = await runProductionManifest(manifest, result, {
      outputDir: outDir,
      mmxBin: join(binSentinel, 'mmx'),
      comicCreatorBin: join(binSentinel, 'comic-creator'),
      videoPollIntervalSec: 0,
      resume: true,
    });
    // All four phases should still be done.
    for (const p of second.phases) {
      assert.equal(p.status, 'done', `phase ${p.phaseId} should be done after resume, got ${p.status}`);
    }
    // Music + video phases should be the carried-forward ones
    // (i.e. they have a trailing "reused from prior report" step).
    const music = second.phases.find((p) => p.phaseId === 'music-theme')!;
    assert.ok(
      music.steps.some((s) => s.label === 'reused from prior report'),
      'music-theme should be marked reused'
    );
    const video = second.phases.find((p) => p.phaseId === 'video-clips')!;
    assert.ok(
      video.steps.some((s) => s.label === 'reused from prior report'),
      'video-clips should be marked reused'
    );
    // Preflight was re-run (it always is) — and since we used the
    // sentinel comic-creator (exit 0), it's also done.
    const preflight = second.phases.find((p) => p.phaseId === 'preflight')!;
    assert.ok(
      !preflight.steps.some((s) => s.label === 'reused from prior report'),
      'preflight should NOT be marked reused — it always re-runs'
    );
    // The original outputs (theme.mp3, clip-1.mp4, etc.) are still
    // on disk and the report should still reference them.
    assert.equal(second.files.length, first.files.length);
    for (const path of first.files) {
      // Strip the report file — second run overwrites that one.
      if (path.endsWith('-production-run-report.json')) continue;
      assert.ok(
        second.files.includes(path),
        `resumed report should still reference ${path}`
      );
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function testResumeReRunsErroredPhase(): Promise<void> {
  const tmp = await makeTempDir();
  try {
    const result = fakeComicResult();
    const manifest = fakeManifest(result);
    // Use a fake mmx that fails on `mmx video generate` (but
    // succeeds on preflight + music). So the first run completes
    // preflight + music, then errors on video-clips.
    const bin = join(tmp, 'bin-mixed');
    await mkdir(bin, { recursive: true });
    const stateFile = join(tmp, 'state', 'count.txt');
    await mkdir(dirname(stateFile), { recursive: true });
    await writeFile(stateFile, '0', 'utf8');
    const mmxScript = `#!/usr/bin/env bash
STATE="${stateFile}"
N=$(cat "$STATE")
N=$((N + 1))
echo "$N" > "$STATE"
case "$1" in
  music)
    OUT=""
    for ((i=1; i<=$#; i++)); do
      case "\${!i}" in
        --out) NEXT=$((i+1)); OUT="\${!NEXT}"; i=$((i+1));;
      esac
    done
    if [ -n "$OUT" ]; then
      mkdir -p "$(dirname "$OUT")"
      echo "fake-mp3" > "$OUT"
    fi
    printf '%s\\n' "{\\"status\\":\\"success\\"}"
    exit 0
    ;;
  video)
    # Always fail — first run should error here
    printf 'simulated video failure\\n' >&2
    exit 1
    ;;
esac
exit 0
`;
    await writeFile(join(bin, 'mmx'), mmxScript, { mode: 0o755 });
    await writeFile(
      join(bin, 'comic-creator'),
      `#!/usr/bin/env bash
printf '%s\\n' "{\\"status\\":\\"pass\\"}"
exit 0
`,
      { mode: 0o755 }
    );
    const outDir = join(tmp, 'out');
    // First run: preflight OK, music OK, video FAILS.
    const first = await runProductionManifest(manifest, result, {
      outputDir: outDir,
      mmxBin: join(bin, 'mmx'),
      comicCreatorBin: join(bin, 'comic-creator'),
      videoPollIntervalSec: 0,
    });
    assert.equal(first.phases[0].status, 'done');
    assert.equal(first.phases[1].status, 'done');
    assert.equal(first.phases[2].status, 'error');
    assert.equal(first.phases.length, 3);
    // Theme audio should be on disk; clip-1.mp4 should NOT.
    const themePath = join(outDir, 'the-robot-garden-theme.mp3');
    assert.ok(existsSync(themePath));
    // Second run: swap mmx to a working one, but call with
    // resume=true. Expect: preflight re-runs, music carries forward
    // (theme.mp3 still on disk), video re-runs and succeeds.
    const binWorking = join(tmp, 'bin-working');
    await mkdir(binWorking, { recursive: true });
    const workingState = join(tmp, 'state', 'working.txt');
    await writeFile(workingState, '0', 'utf8');
    const workingMmx = `#!/usr/bin/env bash
WS="${workingState}"
N=$(cat "$WS")
N=$((N + 1))
echo "$N" > "$WS"
case "$1" in
  music)
    shift
    OUT=""
    for ((i=1; i<=$#; i++)); do
      case "\${!i}" in
        --out) NEXT=$((i+1)); OUT="\${!NEXT}"; i=$((i+1));;
      esac
    done
    if [ -n "$OUT" ]; then
      mkdir -p "$(dirname "$OUT")"
      echo "fake-mp3" > "$OUT"
    fi
    printf '%s\\n' "{\\"status\\":\\"success\\"}"
    exit 0
    ;;
  video)
    shift
    if [[ " $* " == *" task get "* ]]; then
      TASK_ID=""
      for ((i=1; i<=$#; i++)); do
        case "\${!i}" in
          --task-id) NEXT=$((i+1)); TASK_ID="\${!NEXT}"; i=$((i+1));;
        esac
      done
      COUNT_FILE="$WS.$TASK_ID"
      if [ -f "$COUNT_FILE" ]; then NV=$(cat "$COUNT_FILE"); else NV=0; fi
      NV=$((NV + 1))
      echo "$NV" > "$COUNT_FILE"
      if [ "$NV" -ge 2 ]; then
        printf '%s\\n' "{\\"task_id\\":\\"$TASK_ID\\",\\"status\\":\\"Success\\",\\"file_id\\":\\"file-$TASK_ID\\"}"
      else
        printf '%s\\n' "{\\"task_id\\":\\"$TASK_ID\\",\\"status\\":\\"Running\\"}"
      fi
      exit 0
    fi
    if [[ " $* " == *" generate "* ]]; then
      TASK_ID="task-\\$(date +%s%N)"
      printf '%s\\n' "{\\"task_id\\":\\"$TASK_ID\\"}"
      exit 0
    fi
    if [[ " $* " == *" download "* ]]; then
      OUT=""
      for ((i=1; i<=$#; i++)); do
        case "\${!i}" in
          --out) NEXT=$((i+1)); OUT="\${!NEXT}"; i=$((i+1));;
        esac
      done
      if [ -n "$OUT" ]; then
        mkdir -p "$(dirname "$OUT")"
        echo "fake-mp4" > "$OUT"
      fi
      printf '%s\\n' "{\\"status\\":\\"success\\"}"
      exit 0
    fi
    exit 0
    ;;
esac
exit 0
`;
    await writeFile(join(binWorking, 'mmx'), workingMmx, { mode: 0o755 });
    await writeFile(
      join(binWorking, 'comic-creator'),
      `#!/usr/bin/env bash
printf '%s\\n' "{\\"status\\":\\"pass\\"}"
exit 0
`,
      { mode: 0o755 }
    );
    const second = await runProductionManifest(manifest, result, {
      outputDir: outDir,
      mmxBin: join(binWorking, 'mmx'),
      comicCreatorBin: join(binWorking, 'comic-creator'),
      videoPollIntervalSec: 0,
      resume: true,
    });
    // After resume: preflight done, music reused (carried forward),
    // video re-run and done.
    const musicPhase = second.phases.find((p) => p.phaseId === 'music-theme')!;
    assert.equal(musicPhase.status, 'done');
    assert.ok(
      musicPhase.steps.some((s) => s.label === 'reused from prior report'),
      'music should be carried forward'
    );
    const videoPhase = second.phases.find((p) => p.phaseId === 'video-clips')!;
    assert.equal(videoPhase.status, 'done');
    assert.ok(
      !videoPhase.steps.some((s) => s.label === 'reused from prior report'),
      'video should NOT be carried forward (it errored last time)'
    );
    // 2 clip mp4 files should now be on disk.
    for (let i = 1; i <= 2; i++) {
      const clipPath = join(outDir, `the-robot-garden-clip-${i}.mp4`);
      assert.ok(existsSync(clipPath), `expected ${clipPath} to exist after resume`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function testResumeWithoutPriorReportJustRunsNormally(): Promise<void> {
  const tmp = await makeTempDir();
  try {
    const result = fakeComicResult();
    const manifest = fakeManifest(result);
    const { mmx, comic } = await installFakeBinaries(tmp);
    const outDir = join(tmp, 'out');
    // No prior report on disk; resume=true should be a no-op for the
    // resume machinery and the runner should run everything fresh.
    const report = await runProductionManifest(manifest, result, {
      outputDir: outDir,
      mmxBin: mmx,
      comicCreatorBin: comic,
      videoPollIntervalSec: 0,
      resume: true,
    });
    for (const p of report.phases) assert.equal(p.status, 'done');
    // No "reused from prior report" step should appear.
    for (const p of report.phases) {
      assert.equal(
        p.steps.some((s) => s.label === 'reused from prior report'),
        false,
        `phase ${p.phaseId} should not be marked reused on a fresh run`
      );
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function testResumeIsIgnoredInDryRun(): Promise<void> {
  // resume:true + dryRun:true → resume machinery should be skipped
  // (we don't try to load the on-disk report in dry-run mode) and
  // the report should look like a normal dry-run, not a resumed one.
  const tmp = await makeTempDir();
  try {
    const result = fakeComicResult();
    const manifest = fakeManifest(result);
    const { mmx, comic } = await installFakeBinaries(tmp);
    const outDir = join(tmp, 'out');
    // Pre-populate the report dir with a fake prior report so we can
    // assert the runner doesn't pick it up under dry-run.
    const reportPath = join(outDir, 'the-robot-garden-production-run-report.json');
    await mkdir(outDir, { recursive: true });
    await writeFile(reportPath, JSON.stringify({
      format: 'production-run-report',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:01:00Z',
      manifest: { jobId: 'old', title: 'old', projectGoal: 'comic' },
      outputDir: outDir,
      phases: [{
        phaseId: 'music-theme',
        title: 'old',
        status: 'done',
        steps: [],
        outputs: ['/nope/old.mp3'],
      }],
      files: ['/nope/old.mp3'],
      taskIds: [],
      errors: [],
      dryRun: true,
    }), 'utf8');
    const report = await runProductionManifest(manifest, result, {
      outputDir: outDir,
      mmxBin: mmx,
      comicCreatorBin: comic,
      videoPollIntervalSec: 0,
      resume: true,
      dryRun: true,
    });
    assert.equal(report.dryRun, true);
    // Should have re-planned all four phases, NOT carried forward the
    // bogus prior one.
    for (const p of report.phases) {
      assert.equal(
        p.steps.some((s) => s.label === 'reused from prior report'),
        false,
        `phase ${p.phaseId} should not be carried forward in dry-run`
      );
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
