import assert from 'node:assert/strict';
import { buildStoryProject } from './story-project.js';
import { renderAgentGuidanceMarkdown } from './agent-guidance.js';

const project = buildStoryProject('A small crew saves a floating city.', {
  artStyle: 'cinematic comic',
  projectGoal: 'screen',
});

assert.equal(project.premise, 'A small crew saves a floating city.');
assert.equal(project.artStyle, 'cinematic comic');
assert.equal(project.projectGoal, 'screen');
assert.equal(project.renderProfile.outputProfile, 'storyboard-widescreen');
assert.equal(project.storyBible.premise, 'A small crew saves a floating city.');
assert.equal(project.adaptationPackage.sceneOutline.length > 0, true);
assert.equal(project.adaptationPackage.screenplayScenes.length >= 3, true);
assert.equal(project.adaptationPackage.screenplayScenes[0]?.slugline.startsWith('INT./EXT.'), true);
assert.equal(project.adaptationPackage.screenplayScenes[0]?.dialogueSample.length > 0, true);
assert.equal(project.adaptationPackage.storyboardPrompts.length >= 3, true);
assert.equal(project.seriesPackage.format, 'series-bible');
assert.equal(project.seriesPackage.targetFormat, 'series');
assert.equal(project.seriesPackage.episodeOutline.length >= 3, true);
assert.equal(project.seriesPackage.pilotBeatSheet.length >= 3, true);
assert.equal(project.seriesPackage.showrunnerNotes.length >= 3, true);
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

const guidance = renderAgentGuidanceMarkdown(project);
assert.equal(guidance.includes('Hermes + OpenClaw playbook'), true);
assert.equal(guidance.includes('Show / Movie Handoff'), true);
assert.equal(guidance.includes('Project goal: screen'), true);
assert.equal(guidance.includes('song sheet and theme audio'), true);
assert.equal(guidance.includes('Studio bundle path'), true);
assert.equal(guidance.includes('Use the studio bundle to hand off the full project state'), true);

console.log('PASS story-project');
