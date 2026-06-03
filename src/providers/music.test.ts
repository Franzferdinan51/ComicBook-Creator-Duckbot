import assert from 'node:assert/strict';
import { getMusicProvider, listMusicProviders } from './index.js';
import { buildStoryProject } from '../project/index.js';

const provider = getMusicProvider('mock');
const project = buildStoryProject('A comic crew writes a movie theme.', {
  outputProfile: 'storyboard-widescreen',
});
const wav = await provider.generate(project, { seed: 7 });

assert.equal(provider.name, 'mock');
assert.equal(listMusicProviders().includes('mock'), true);
assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
assert.throws(() => getMusicProvider('not-real'), /Unknown music provider/);

console.log('PASS music providers');
