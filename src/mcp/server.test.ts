import assert from 'node:assert/strict';
import { isDirectEntrypoint } from './entrypoint.js';
import { audioExtensionForPath, audioMimeTypeForPath } from '../project/index.js';

const serverUrl = new URL('./server.ts', import.meta.url).href;
const serverPath = new URL('./server.ts', import.meta.url).pathname;

assert.equal(isDirectEntrypoint(serverUrl, serverPath), true);
assert.equal(isDirectEntrypoint(serverUrl, undefined), false);
assert.equal(isDirectEntrypoint(serverUrl, '/tmp/not-the-server.ts'), false);
assert.equal(audioExtensionForPath('/tmp/theme.mp3'), 'mp3');
assert.equal(audioMimeTypeForPath('/tmp/theme.mp3'), 'audio/mpeg');
assert.equal(audioExtensionForPath('/tmp/theme.wav'), 'wav');
assert.equal(audioMimeTypeForPath('/tmp/theme.wav'), 'audio/wav');

console.log('PASS mcp');
