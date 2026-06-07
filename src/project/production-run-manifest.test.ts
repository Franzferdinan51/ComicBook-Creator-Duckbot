import assert from 'node:assert/strict';
import { buildStoryProject } from './story-project.js';
import { buildAgentWorkflowPackage } from './agent-workflow-package.js';
import { buildProductionRunManifest } from './production-run-manifest.js';
import { buildVideoPackage } from './video-assets.js';
import type { ComicResult } from '../types.js';

const project = buildStoryProject('A pilot crew turns a comic into a real show.', {
  artStyle: 'cinematic comic',
  projectGoal: 'studio',
  characterReferences: ['https://example.com/lead-hero.png'],
});

const result: ComicResult = {
  script: {
    title: project.title,
    artStyle: project.artStyle,
    pages: [
      {
        pageNumber: 1,
        layout: 'grid-2x2',
        panels: [
          {
            id: 'p1-panel1',
            description: 'A production-ready hero shot.',
          },
        ],
      },
    ],
  },
  outputPath: '/tmp/pilot.pdf',
  pdfPath: '/tmp/pilot.pdf',
  cbzPath: '/tmp/pilot.cbz',
  coverImagePath: '/tmp/pilot.images/cover.png',
  project,
  projectPath: '/tmp/pilot-project.json',
  storyBible: project.storyBible,
  adaptationPackage: project.adaptationPackage,
  seriesPackage: project.seriesPackage,
  trailerPackage: project.trailerPackage,
  videoPackage: buildVideoPackage({
    project,
    pages: [
      {
        page: {
          pageNumber: 1,
          layout: 'grid-2x2',
          panels: [{ id: 'p1-panel1', description: 'A production-ready hero shot.' }],
        },
        panelImagePaths: ['/tmp/pilot.images/p1-panel1.png'],
      },
    ],
    songAudioPath: '/tmp/pilot-theme.wav',
    characterReferences: ['https://example.com/lead-hero.png'],
  }),
  musicCuePackage: project.musicCuePackage,
  agentGuidancePackage: project.agentGuidancePackage,
  agentWorkflowPackage: {} as ComicResult['agentWorkflowPackage'],
  productionRunManifest: {} as ComicResult['productionRunManifest'],
  agentGuidancePath: '/tmp/pilot-agent-guidance.md',
  agentWorkflowPackagePath: '/tmp/pilot-agent-workflow-package.json',
  productionRunManifestPath: '/tmp/pilot-production-run-manifest.json',
  screenplayPath: '/tmp/pilot-screenplay.md',
  directorBriefPath: '/tmp/pilot-director-brief.md',
  agentPlaybookPath: '/repo/docs/agents/hermes-openclaw-playbook.md',
  songSheetPath: '/tmp/pilot-song-sheet.md',
  songAudioPath: '/tmp/pilot-theme.wav',
  musicCuePackagePath: '/tmp/pilot-music-cue-package.json',
  musicProvider: 'mock',
  storyboardPackagePath: '/tmp/pilot-storyboard-package.json',
  trailerPackagePath: '/tmp/pilot-trailer-package.json',
  videoPackagePath: '/tmp/pilot-video-package.json',
  seriesPackagePath: '/tmp/pilot-series-package.json',
  animaticTimelinePath: '/tmp/pilot-animatic-timeline.json',
  studioBundlePath: '/tmp/pilot-studio-bundle.json',
  pages: [
    {
      page: {
        pageNumber: 1,
        layout: 'grid-2x2',
        panels: [
          {
            id: 'p1-panel1',
            description: 'A production-ready hero shot.',
          },
        ],
      },
      imagePath: '/tmp/pilot.images/p1-panel1.png',
      panelImagePaths: ['/tmp/pilot.images/p1-panel1.png'],
      layout: 'grid-2x2',
    },
  ],
};
result.agentWorkflowPackage = buildAgentWorkflowPackage(project.id, result);
result.productionRunManifest = buildProductionRunManifest(project.id, result);

assert.equal(result.productionRunManifest.format, 'production-run-manifest');
assert.equal(result.productionRunManifest.provider, 'minimax');
assert.equal(result.productionRunManifest.jobId, project.id);
assert.equal(result.productionRunManifest.entrypoints.studioBundlePath, result.studioBundlePath);
assert.equal(result.productionRunManifest.entrypoints.videoPackagePath, result.videoPackagePath);
assert.equal(result.productionRunManifest.entrypoints.musicCuePackagePath, result.musicCuePackagePath);
assert.equal(result.productionRunManifest.entrypoints.agentWorkflowPackagePath, result.agentWorkflowPackagePath);
assert.equal(result.productionRunManifest.gates.some((gate) => gate.command === 'comic-creator --preflight'), true);
assert.equal(result.productionRunManifest.gates.some((gate) => gate.command === 'mmx auth status'), true);
assert.equal(result.productionRunManifest.phases.some((phase) => phase.phaseId === 'music-theme'), true);
assert.equal(result.productionRunManifest.phases.some((phase) => phase.phaseId === 'video-clips'), true);
assert.equal(result.productionRunManifest.phases.some((phase) => phase.commands.some((command) => command.includes('mmx video generate'))), true);
assert.equal(result.productionRunManifest.phases.some((phase) => phase.commands.some((command) => command.includes('--first-frame'))), true);
assert.equal(result.productionRunManifest.phases.some((phase) => phase.commands.some((command) => command.includes('--subject-image'))), true);
assert.equal(result.productionRunManifest.phases.some((phase) => phase.commands.some((command) => command.includes('mmx video task get'))), true);
assert.equal(result.productionRunManifest.phases.some((phase) => phase.commands.some((command) => command.includes('mmx music generate'))), true);
assert.equal(result.productionRunManifest.agentInstructions.hermes.includes('decompose'), true);
assert.equal(result.productionRunManifest.agentInstructions.openClaw.includes('gateway'), true);
assert.equal(result.productionRunManifest.reviewChecklist.some((item) => item.includes('not a slideshow')), true);
assert.equal(result.agentWorkflowPackage.commandBlueprints.minimax.some((command) => command.includes('--first-frame')), true);
assert.equal(result.agentWorkflowPackage.commandBlueprints.minimax.some((command) => command.includes('--subject-image')), true);

console.log('PASS production-run-manifest');
