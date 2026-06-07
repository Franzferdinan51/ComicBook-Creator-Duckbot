import assert from 'node:assert/strict';
import { buildStoryProject } from './story-project.js';
import { buildVideoPackage } from './video-assets.js';
import {
  buildMiniMaxVideoGenerateArgs,
  buildMiniMaxVideoGenerateCommand,
} from './minimax-video-command.js';

const project = buildStoryProject('A masked hero returns for a motion-heavy teaser.', {
  artStyle: 'cinematic comic',
  projectGoal: 'screen',
  characterReferences: ['https://example.com/hero-subject.png'],
});

const videoPackage = buildVideoPackage({
  project,
  pages: [
    {
      page: {
        pageNumber: 1,
        layout: 'grid-2x2',
        panels: [
          { id: 'p1-panel1', description: 'Hero reveal on a rooftop.' },
        ],
      },
      panelImagePaths: ['/tmp/hero-rooftop.png'],
    },
  ],
  songAudioPath: '/tmp/theme.mp3',
  characterReferences: ['https://example.com/hero-subject.png'],
});

assert.equal(videoPackage.subjectReferenceImages?.[0], 'https://example.com/hero-subject.png');
assert.equal(videoPackage.commands.generate.includes('--first-frame'), true);
assert.equal(videoPackage.commands.generate.includes('--subject-image'), true);
assert.equal(videoPackage.clips[0]?.referenceImagePath, '/tmp/hero-rooftop.png');
assert.equal(videoPackage.clips[0]?.subjectImagePath, 'https://example.com/hero-subject.png');
assert.equal(videoPackage.workflowNotes.some((note) => note.includes('subject reference image')), true);

// buildMiniMaxVideoGenerateArgs wires the per-clip reference + the
// project-wide character reference through to mmx video generate.
// This is the contract the production-runner relies on, so test it
// here too (the runner has its own coverage but the helper is the
// canonical place to lock the behavior in).
{
  const args = buildMiniMaxVideoGenerateArgs({
    prompt: 'A robot at sunrise.',
    referenceImagePath: '/tmp/clip-ref.png',
    subjectImagePath: 'https://example.com/character.png',
  });
  assert.deepEqual(args, [
    'video',
    'generate',
    '--prompt',
    'A robot at sunrise.',
    '--first-frame',
    '/tmp/clip-ref.png',
    '--subject-image',
    'https://example.com/character.png',
    '--async',
  ]);
}

// When no references are supplied the helper still emits the base
// generate command — the runner uses this as a no-frills fallback
// for clip packages built without character consistency.
{
  const args = buildMiniMaxVideoGenerateArgs({ prompt: 'Plain clip.' });
  assert.deepEqual(args, ['video', 'generate', '--prompt', 'Plain clip.', '--async']);
}

// buildMiniMaxVideoGenerateCommand produces a copy-pasteable shell
// string for the production run manifest. Spaces and quotes must
// survive intact; an unquoted path with no special chars is left
// alone.
{
  const cmd = buildMiniMaxVideoGenerateCommand({
    prompt: 'A robot at sunrise.',
    referenceImagePath: '/tmp/clip ref.png',
    subjectImagePath: 'https://example.com/character.png',
  });
  // The path contains a space and must be JSON-quoted.
  assert.match(cmd, /"\/tmp\/clip ref\.png"/);
  // The URL is pure ASCII and stays unquoted.
  assert.match(cmd, /--subject-image https:\/\/example\.com\/character\.png/);
  // The mmx binary comes first.
  assert.match(cmd, /^mmx /);
}

console.log('PASS video-assets');
