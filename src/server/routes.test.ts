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
    },
    musicCuePackage: {
      format: 'music-brief',
      cues: [{ cueId: 'cue-1', title: 'Cue 1', mood: 'hopeful', placement: 'opening' }],
      themeSongPrompt: 'Theme prompt',
    },
  },
  adaptationPackage: {
    format: 'screen-outline',
    sceneOutline: [{ sceneId: 'scene-1', summary: 'Scene summary', visualGoal: 'Goal' }],
  },
  musicCuePackage: {
    format: 'music-brief',
    cues: [{ cueId: 'cue-1', title: 'Cue 1', mood: 'hopeful', placement: 'opening' }],
    themeSongPrompt: 'Theme prompt',
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
  assert.equal(Array.isArray(resolved?.result.musicCuePackage.cues), true);
  console.log('PASS routes');
} finally {
  await rm(storageDir, { recursive: true, force: true });
  process.exit(0);
}
