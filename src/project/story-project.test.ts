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
assert.equal(project.adaptationPackage.screenplayScenes.length >= 3, true);
assert.equal(project.adaptationPackage.screenplayScenes[0]?.slugline.startsWith('INT./EXT.'), true);
assert.equal(project.adaptationPackage.screenplayScenes[0]?.dialogueSample.length > 0, true);
assert.equal(project.adaptationPackage.storyboardPrompts.length >= 3, true);
assert.equal(project.musicCuePackage.cues.length > 0, true);
assert.equal(project.musicCuePackage.sceneCueMap.length >= 3, true);
assert.equal(project.musicCuePackage.songDraft.sections.length >= 3, true);
assert.equal(project.musicCuePackage.songDraft.lyrics.includes(project.title), true);
assert.equal(project.musicCuePackage.musicGenerationPrompt.includes('instrumentation'), true);
assert.equal(project.musicCuePackage.themeSongPrompt.includes(project.title), true);
assert.equal(project.agentGuidancePackage.format, 'agent-guidance');
assert.equal(project.agentGuidancePackage.frameworks.hermesAgent.repository, 'https://github.com/nousresearch/hermes-agent');
assert.equal(project.agentGuidancePackage.frameworks.openClaw.repository, 'https://github.com/openclaw/openclaw');
assert.equal(project.agentGuidancePackage.workflowSteps.length >= 3, true);
assert.equal(project.agentGuidancePackage.deliverables.some((item) => item.includes('screen adaptation')), true);
assert.equal(project.agentGuidancePackage.systemPrompt.includes(project.title), true);

console.log('PASS story-project');
