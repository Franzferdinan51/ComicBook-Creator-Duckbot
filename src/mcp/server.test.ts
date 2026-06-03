import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMcpServer } from './server.js';
import { isDirectEntrypoint } from './entrypoint.js';
import { audioExtensionForPath, audioMimeTypeForPath } from '../project/index.js';
import { setStorageDir } from '../server/storage.js';

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

const storageDir = await mkdtemp(join(tmpdir(), 'comic-mcp-test-'));
setStorageDir(storageDir);
try {
  const mcpServer: any = buildMcpServer();
  const settingsJson = await mcpServer._registeredTools.get_settings.handler({});
  const settings = JSON.parse(settingsJson.content[0].text);
  assert.equal(settings.defaultProjectGoal, 'comic');
  const updatedJson = await mcpServer._registeredTools.update_settings.handler({ defaultProjectGoal: 'music' });
  const updated = JSON.parse(updatedJson.content[0].text);
  assert.equal(updated.defaultProjectGoal, 'music');
} finally {
  await rm(storageDir, { recursive: true, force: true });
}

const playbook = await readFile(new URL('../../docs/agents/hermes-openclaw-playbook.md', import.meta.url), 'utf8');
assert.equal(playbook.includes('Hermes + OpenClaw Playbook'), true);
assert.equal(playbook.includes('OpenClaw Use'), true);

console.log('PASS mcp');
