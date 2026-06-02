import assert from 'node:assert/strict';
import { buildStoryProject } from './story-project.js';

const project = buildStoryProject('A small crew saves a floating city.', {
  artStyle: 'cinematic comic',
  outputProfile: 'storyboard-widescreen',
});

assert.equal(project.premise, 'A small crew saves a floating city.');
assert.equal(project.artStyle, 'cinematic comic');
assert.equal(project.renderProfile.outputProfile, 'storyboard-widescreen');
assert.equal(project.storyBible.premise, 'A small crew saves a floating city.');
assert.equal(project.adaptationPackage.sceneOutline.length > 0, true);
assert.equal(project.musicCuePackage.cues.length > 0, true);
assert.equal(project.musicCuePackage.themeSongPrompt.includes(project.title), true);

console.log('PASS story-project');
