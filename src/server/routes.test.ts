import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _resetJobManager, getJobManager } from './jobs.js';
import { setStorageDir, upsertHistoryEntry } from './storage.js';
import type { HistoryEntry } from './storage.js';
import { startWebUI } from './index.js';

const storageDir = await mkdtemp(join(tmpdir(), 'comic-routes-test-'));
setStorageDir(storageDir);
_resetJobManager();

const entry: HistoryEntry = {
  jobId: 'history-job',
  title: 'History Project',
  createdAt: new Date().toISOString(),
  artStyle: 'manga',
  pageCount: 1,
  outputPath: '/tmp/history-job.pdf',
  pdfPath: '/tmp/history-job.pdf',
  cbzPath: '/tmp/history-job.cbz',
  coverImagePath: '/tmp/history-job.images/cover.png',
  projectPath: '/tmp/history-job-project.json',
  songSheetPath: '/tmp/history-job-song-sheet.md',
  songAudioPath: '/tmp/history-job-theme.wav',
  musicProvider: 'mock',
  storyboardPackagePath: '/tmp/history-job-storyboard-package.json',
  animaticTimelinePath: '/tmp/history-job-animatic-timeline.json',
  studioBundlePath: '/tmp/history-job-studio-bundle.json',
    project: {
      id: 'project-1',
      title: 'History Project',
      premise: 'History project premise',
      artStyle: 'manga',
      projectGoal: 'screen',
      renderProfile: {
        outputProfile: 'storyboard-widescreen',
        page: { width: 1600, height: 900, margin: 48, bleed: 0 },
      panel: { aspectRatio: '16:9', targetWidth: 1536, targetHeight: 864, fit: 'contain' },
      cover: { width: 1600, height: 900, aspectRatio: '16:9' },
    },
    storyBible: {
      premise: 'History project premise',
      synopsis: 'History project synopsis',
      chapterOutline: ['Opening'],
      sceneBeats: ['Beat 1'],
    },
    adaptationPackage: {
      format: 'screen-outline',
      sceneOutline: [{ sceneId: 'scene-1', summary: 'Scene summary', visualGoal: 'Goal' }],
      screenplayScenes: [{
        sceneId: 'scene-1',
        slugline: 'INT./EXT. HISTORY SPACE - DAY',
        action: 'History action',
        dialogueSample: ['LEAD: History line.'],
        shotList: ['wide shot'],
      }],
      storyboardPrompts: [{
        sceneId: 'scene-1',
        prompt: 'History storyboard prompt',
        cameraLanguage: 'wide frame',
      }],
    },
    musicCuePackage: {
      format: 'music-brief',
      cues: [{ cueId: 'cue-1', title: 'Cue 1', mood: 'hopeful', placement: 'opening', sceneId: 'scene-1' }],
      sceneCueMap: [{ sceneId: 'scene-1', cueId: 'cue-1', timing: '00:00-00:30', purpose: 'History purpose' }],
      songDraft: {
        title: 'History Theme',
        genre: 'cinematic pop',
        bpm: 96,
        key: 'A minor',
        sections: ['verse', 'chorus'],
        lyrics: 'History Project chorus',
      },
      themeSongPrompt: 'Theme prompt',
      musicGenerationPrompt: 'Generate music with instrumentation for History Project.',
    },
  },
  adaptationPackage: {
    format: 'screen-outline',
    sceneOutline: [{ sceneId: 'scene-1', summary: 'Scene summary', visualGoal: 'Goal' }],
    screenplayScenes: [{
      sceneId: 'scene-1',
      slugline: 'INT./EXT. HISTORY SPACE - DAY',
      action: 'History action',
      dialogueSample: ['LEAD: History line.'],
      shotList: ['wide shot'],
    }],
    storyboardPrompts: [{
      sceneId: 'scene-1',
      prompt: 'History storyboard prompt',
      cameraLanguage: 'wide frame',
    }],
  },
  musicCuePackage: {
    format: 'music-brief',
    cues: [{ cueId: 'cue-1', title: 'Cue 1', mood: 'hopeful', placement: 'opening', sceneId: 'scene-1' }],
    sceneCueMap: [{ sceneId: 'scene-1', cueId: 'cue-1', timing: '00:00-00:30', purpose: 'History purpose' }],
    songDraft: {
      title: 'History Theme',
      genre: 'cinematic pop',
      bpm: 96,
      key: 'A minor',
      sections: ['verse', 'chorus'],
      lyrics: 'History Project chorus',
    },
    themeSongPrompt: 'Theme prompt',
    musicGenerationPrompt: 'Generate music with instrumentation for History Project.',
  },
  scriptJson: {
    title: 'History Project',
    artStyle: 'manga',
    pages: [{ pageNumber: 1, layout: 'grid-2x2', panels: [{ id: 'p1-panel1', description: 'A panel' }] }],
  },
  };

try {
  await upsertHistoryEntry(entry);
  await writeFile(entry.studioBundlePath!, JSON.stringify({
    format: 'studio-bundle',
    jobId: 'history-job',
    title: 'History Project',
    artifactPaths: {
      outputPath: entry.outputPath,
      pdfPath: entry.pdfPath,
      cbzPath: entry.cbzPath,
      coverImagePath: entry.coverImagePath,
      projectPath: entry.projectPath,
      agentGuidancePath: '/tmp/history-job-agent-guidance.md',
      songSheetPath: entry.songSheetPath,
      songAudioPath: entry.songAudioPath,
      storyboardPackagePath: entry.storyboardPackagePath,
      animaticTimelinePath: entry.animaticTimelinePath,
      studioBundlePath: entry.studioBundlePath,
      agentPlaybookPath: '/tmp/docs/agents/hermes-openclaw-playbook.md',
    },
    availability: {
      pdf: true,
      cbz: true,
      coverImage: true,
      project: true,
      agentGuidance: true,
      songSheet: true,
      songAudio: true,
      storyboardPackage: true,
      animaticTimeline: true,
      studioBundle: true,
    },
  }), 'utf8');
  const resolved = await getJobManager().resolve('history-job');
  assert.equal(resolved?.status, 'done');
  assert.equal(resolved?.fromHistory, true);
  assert.equal(resolved?.result.project.renderProfile.outputProfile, 'storyboard-widescreen');
  assert.equal(resolved?.result.project.projectGoal, 'screen');
  assert.equal(Array.isArray(resolved?.result.adaptationPackage.sceneOutline), true);
  assert.equal(Array.isArray(resolved?.result.adaptationPackage.screenplayScenes), true);
  assert.equal(Array.isArray(resolved?.result.musicCuePackage.cues), true);
  assert.equal(Array.isArray(resolved?.result.musicCuePackage.sceneCueMap), true);
  assert.equal(resolved?.result.projectPath, '/tmp/history-job-project.json');
  assert.equal(resolved?.result.songSheetPath, '/tmp/history-job-song-sheet.md');
  assert.equal(resolved?.result.songAudioPath, '/tmp/history-job-theme.wav');
  assert.equal(resolved?.result.musicProvider, 'mock');
  assert.equal(resolved?.result.storyboardPackagePath, '/tmp/history-job-storyboard-package.json');
  assert.equal(resolved?.result.animaticTimelinePath, '/tmp/history-job-animatic-timeline.json');

  const handle = await startWebUI({ port: 0, webuiDir: join(process.cwd(), 'webui') });
  try {
    const res = await fetch(`http://127.0.0.1:${handle.port}/api/agent-playbook`);
    assert.equal(res.ok, true);
    assert.equal(res.headers.get('content-type')?.includes('text/markdown'), true);
    const text = await res.text();
    assert.equal(text.includes('Hermes + OpenClaw Playbook'), true);
    assert.equal(text.includes('Music Handoff'), true);

    const bundleRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/studio-bundle`);
    assert.equal(bundleRes.ok, true);
    assert.equal(bundleRes.headers.get('content-type')?.includes('application/json'), true);
    const bundle = await bundleRes.json();
    assert.equal(bundle.format, 'studio-bundle');
    assert.equal(bundle.jobId, 'history-job');
    assert.equal(bundle.artifactPaths.agentPlaybookPath.endsWith('docs/agents/hermes-openclaw-playbook.md'), true);
    assert.equal(bundle.artifactPaths.studioBundlePath, entry.studioBundlePath);
    assert.equal(bundle.availability.storyboardPackage, true);
    assert.equal(bundle.availability.animaticTimeline, true);
    assert.equal(bundle.availability.studioBundle, true);

    const createRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        story: 'A test comic becomes a screen-ready pilot.',
        options: {
          artStyle: 'manga',
          projectGoal: 'screen',
          textProvider: 'mock',
          imageProvider: 'mock',
          musicProvider: 'mock',
          pageCount: 1,
          panelsPerPage: 3,
        },
      }),
    });
    assert.equal(createRes.status, 202);
    const { jobId } = await createRes.json() as { jobId: string };
    let generated: Record<string, unknown> | null = null;
    for (let i = 0; i < 25; i++) {
      const pollRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/${jobId}`);
      assert.equal(pollRes.ok, true);
      const body = await pollRes.json() as Record<string, unknown>;
      if (body.status === 'done') {
        generated = body;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(generated, 'expected the generated job to finish');
    const generatedResult = generated?.result as {
      project?: { projectGoal?: string; renderProfile?: { outputProfile?: string } };
    };
    assert.equal(generatedResult.project?.projectGoal, 'screen');
    assert.equal(generatedResult.project?.renderProfile?.outputProfile, 'storyboard-widescreen');
  } finally {
    await handle.close();
  }
  console.log('PASS routes');
} finally {
  await rm(storageDir, { recursive: true, force: true });
  process.exit(0);
}
