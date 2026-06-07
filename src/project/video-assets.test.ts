import assert from 'node:assert/strict';
import { buildStoryProject } from './story-project.js';
import { buildVideoPackage } from './video-assets.js';

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

console.log('PASS video-assets');
