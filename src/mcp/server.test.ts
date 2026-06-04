import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMcpServer } from './server.js';
import { isDirectEntrypoint } from './entrypoint.js';
import { audioExtensionForPath, audioMimeTypeForPath } from '../project/index.js';
import { setStorageDir } from '../server/storage.js';
import { _resetJobManager, getJobManager } from '../server/jobs.js';

const serverUrl = new URL('./server.ts', import.meta.url).href;
const serverPath = new URL('./server.ts', import.meta.url).pathname;

assert.equal(isDirectEntrypoint(serverUrl, serverPath), true);
assert.equal(isDirectEntrypoint(serverUrl, undefined), false);
assert.equal(isDirectEntrypoint(serverUrl, '/tmp/not-the-server.ts'), false);
assert.equal(audioExtensionForPath('/tmp/theme.mp3'), 'mp3');
assert.equal(audioMimeTypeForPath('/tmp/theme.mp3'), 'audio/mpeg');
assert.equal(audioExtensionForPath('/tmp/theme.wav'), 'wav');
assert.equal(audioMimeTypeForPath('/tmp/theme.wav'), 'audio/wav');

const registeredTools = Object.keys(buildMcpServer()._registeredTools);
assert.equal(registeredTools.includes('regenerate_comic'), true);
assert.equal(registeredTools.includes('get_studio_bundle'), true);
assert.equal(registeredTools.includes('get_music_cue_package'), true);
assert.equal(registeredTools.includes('get_series_package'), true);
assert.equal(registeredTools.includes('get_screenplay'), true);
assert.equal(registeredTools.includes('get_trailer_package'), true);

const storageDir = await mkdtemp(join(tmpdir(), 'comic-mcp-test-'));
setStorageDir(storageDir);
_resetJobManager();
try {
  const mcpServer: any = buildMcpServer();
  const settingsJson = await mcpServer._registeredTools.get_settings.handler({});
  const settings = JSON.parse(settingsJson.content[0].text);
  assert.equal(settings.defaultProjectGoal, 'comic');
  const updatedJson = await mcpServer._registeredTools.update_settings.handler({ defaultProjectGoal: 'music' });
  const updated = JSON.parse(updatedJson.content[0].text);
  assert.equal(updated.defaultProjectGoal, 'music');

  const job = getJobManager().createAndStart({
    story: 'A robot learns a new song for a screen adaptation.',
    options: {
      artStyle: 'manga',
      imageProvider: 'mock',
      textProvider: 'mock',
      musicProvider: 'mock',
      projectGoal: 'studio',
      pageCount: 1,
      panelsPerPage: 3,
      outputFormat: 'pdf',
      outputPath: join(storageDir, 'music-test.pdf'),
    },
  });
  let resolved: any;
  for (let i = 0; i < 50; i++) {
    resolved = await getJobManager().resolve(job.jobId);
    if (resolved?.status === 'done') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(resolved?.status, 'done');
  const musicJson = await mcpServer._registeredTools.get_music_cue_package.handler({ jobId: job.jobId });
  const musicCuePackage = JSON.parse(musicJson.content[0].resource.text);
  assert.equal(musicCuePackage.format, 'music-brief');
  assert.equal(musicCuePackage.songDraft.title.endsWith('Theme'), true);
  const seriesJson = await mcpServer._registeredTools.get_series_package.handler({ jobId: job.jobId });
  const seriesPackage = JSON.parse(seriesJson.content[0].resource.text);
  assert.equal(seriesPackage.format, 'series-bible');
  assert.equal(Array.isArray(seriesPackage.episodeOutline), true);
  const screenplayJson = await mcpServer._registeredTools.get_screenplay.handler({ jobId: job.jobId });
  assert.equal(screenplayJson.content[0].resource.mimeType, 'text/markdown');
  assert.equal(screenplayJson.content[0].resource.text.includes('## Screenplay Handoff'), true);
} finally {
  await rm(storageDir, { recursive: true, force: true });
}

const playbook = await readFile(new URL('../../docs/agents/hermes-openclaw-playbook.md', import.meta.url), 'utf8');
assert.equal(playbook.includes('Hermes + OpenClaw Playbook'), true);
assert.equal(playbook.includes('OpenClaw Use'), true);

console.log('PASS mcp');
