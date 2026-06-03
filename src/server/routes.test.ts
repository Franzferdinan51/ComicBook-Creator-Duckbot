import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _resetJobManager, getJobManager } from './jobs.js';
import { setStorageDir, upsertHistoryEntry } from './storage.js';
import type { HistoryEntry } from './storage.js';

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
  songSheetPath: '/tmp/history-job-song-sheet.md',
  songAudioPath: '/tmp/history-job-theme.wav',
  storyboardPackagePath: '/tmp/history-job-storyboard-package.json',
  animaticTimelinePath: '/tmp/history-job-animatic-timeline.json',
  project: {
    id: 'project-1',
    title: 'History Project',
    premise: 'History project premise',
    artStyle: 'manga',
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
  const resolved = await getJobManager().resolve('history-job');
  assert.equal(resolved?.status, 'done');
  assert.equal(resolved?.fromHistory, true);
  assert.equal(resolved?.result.project.renderProfile.outputProfile, 'storyboard-widescreen');
  assert.equal(Array.isArray(resolved?.result.adaptationPackage.sceneOutline), true);
  assert.equal(Array.isArray(resolved?.result.adaptationPackage.screenplayScenes), true);
  assert.equal(Array.isArray(resolved?.result.musicCuePackage.cues), true);
  assert.equal(Array.isArray(resolved?.result.musicCuePackage.sceneCueMap), true);
  assert.equal(resolved?.result.songSheetPath, '/tmp/history-job-song-sheet.md');
  assert.equal(resolved?.result.songAudioPath, '/tmp/history-job-theme.wav');
  assert.equal(resolved?.result.storyboardPackagePath, '/tmp/history-job-storyboard-package.json');
  assert.equal(resolved?.result.animaticTimelinePath, '/tmp/history-job-animatic-timeline.json');
  console.log('PASS routes');
} finally {
  await rm(storageDir, { recursive: true, force: true });
  process.exit(0);
}
