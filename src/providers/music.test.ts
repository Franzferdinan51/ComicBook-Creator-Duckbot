import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getMusicProvider, listMusicProviders } from './index.js';
import { buildStoryProject } from '../project/index.js';

function makeMp3Stub(): Buffer {
  return Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x0Fmini-max-test');
}

const scratchDir = await mkdtemp(join(tmpdir(), 'comic-music-test-'));
const fakeMmxPath = join(scratchDir, 'fake-mmx.mjs');
const argsPath = join(scratchDir, 'args.json');
const previousBinary = process.env.MINIMAX_MUSIC_BINARY;

await writeFile(
  fakeMmxPath,
  `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
if (!outPath) throw new Error('missing --out');
writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(args, null, 2));
writeFileSync(outPath, Buffer.from(${JSON.stringify(makeMp3Stub().toString('base64'))}, 'base64'));
`,
  'utf8'
);
await chmod(fakeMmxPath, 0o755);
process.env.MINIMAX_MUSIC_BINARY = fakeMmxPath;

try {
  const provider = getMusicProvider('minimax');
  const project = buildStoryProject('A comic crew writes a movie theme.', {
    outputProfile: 'storyboard-widescreen',
  });
  const audio = await provider.generate(project, { seed: 7 });

  assert.equal(provider.name, 'minimax');
  assert.equal(provider.outputExtension, 'mp3');
  assert.equal(provider.mimeType, 'audio/mpeg');
  assert.equal(listMusicProviders().includes('mock'), true);
  assert.equal(listMusicProviders().includes('minimax'), true);
  assert.equal(audio.subarray(0, 3).toString('ascii'), 'ID3');
  assert.throws(() => getMusicProvider('not-real'), /Unknown music provider/);

  const args = JSON.parse(await readFile(argsPath, 'utf8')) as string[];
  assert.equal(args[0], 'music');
  assert.equal(args[1], 'generate');
  assert.equal(args.includes('--quiet'), true);
  assert.equal(args.includes('--non-interactive'), true);
  assert.equal(args.includes('--prompt'), true);
  assert.equal(args.includes('--lyrics'), true);
  assert.equal(args.includes('--genre'), true);
  assert.equal(args.includes('--mood'), true);
  assert.equal(args.includes('--bpm'), true);
  assert.equal(args.includes('--key'), true);
  assert.equal(args[args.indexOf('--out') + 1].endsWith('.mp3'), true);
  assert.equal(args.includes('--instrumental'), false);
} finally {
  if (previousBinary == null) {
    delete process.env.MINIMAX_MUSIC_BINARY;
  } else {
    process.env.MINIMAX_MUSIC_BINARY = previousBinary;
  }
  await rm(scratchDir, { recursive: true, force: true });
}

console.log('PASS music providers');
