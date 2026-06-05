import assert from 'node:assert/strict';
import { access, readFile, rm } from 'node:fs/promises';
import { createComic } from './index.js';
import { PNG } from 'pngjs';

async function main(): Promise<void> {
  const result = await createComic('A robot learns to garden on Mars.', {
    imageProvider: 'mock',
    textProvider: 'mock',
    pageCount: 1,
    panelsPerPage: 3,
    outputFormat: 'pdf',
    projectGoal: 'screen',
    musicProvider: 'mock',
    generateCover: true,
  });

  assert.equal(result.project.renderProfile.outputProfile, 'storyboard-widescreen');
  assert.equal(result.project.renderProfile.page.width, 960);
  assert.equal(result.project.renderProfile.page.height, 540);
  assert.equal(result.project.renderProfile.panel.targetWidth, 1536);
  assert.equal(result.project.renderProfile.panel.targetHeight, 864);
  assert.equal(result.script.pages.length, 1);
  assert.equal(result.script.pages[0]?.panels.length, 3);
  assert.equal(result.adaptationPackage.sceneOutline.length > 0, true);
  assert.equal(result.adaptationPackage.screenplayScenes.length >= 3, true);
  assert.equal(result.adaptationPackage.storyboardPrompts.length >= 3, true);
  assert.equal(result.seriesPackage.format, 'series-bible');
  assert.equal(result.seriesPackage.targetFormat, 'series');
  assert.equal(result.seriesPackage.episodeOutline.length >= 3, true);
  assert.equal(result.musicCuePackage.cues.length > 0, true);
  assert.equal(result.musicCuePackage.songDraft.lyrics.includes(result.project.title), true);
  assert.equal(result.musicCuePackage.sceneCueMap.length >= 3, true);
  assert.equal(result.musicProvider, 'mock');
  assert.equal(result.projectPath?.endsWith('-project.json'), true);
  assert.equal(result.agentPlaybookPath?.endsWith('docs/agents/hermes-openclaw-playbook.md'), true);
  assert.equal(result.agentGuidancePackage.workflowSteps.length >= 3, true);
  assert.equal(result.agentGuidancePath?.endsWith('-agent-guidance.md'), true);
  assert.equal(result.agentWorkflowPackagePath?.endsWith('-agent-workflow-package.json'), true);
  assert.equal(result.agentGuidancePath != null, true);
  assert.equal(result.screenplayPath?.endsWith('-screenplay.md'), true);
  assert.equal(result.directorBriefPath?.endsWith('-director-brief.md'), true);
  assert.equal(result.songSheetPath?.endsWith('-song-sheet.md'), true);
  assert.equal(result.songAudioPath?.endsWith('-theme.wav'), true);
  assert.equal(result.musicCuePackagePath?.endsWith('-music-cue-package.json'), true);
  assert.equal(result.seriesPackagePath?.endsWith('-series-package.json'), true);
  assert.equal(result.storyboardPackagePath?.endsWith('-storyboard-package.json'), true);
  assert.equal(result.trailerPackagePath?.endsWith('-trailer-package.json'), true);
  assert.equal(result.videoPackagePath?.endsWith('-video-package.json'), true);
  assert.equal(result.animaticTimelinePath?.endsWith('-animatic-timeline.json'), true);
  assert.equal(result.studioBundlePath?.endsWith('-studio-bundle.json'), true);

  await access(result.outputPath);
  assert.equal(!!result.cbzPath, true);
  await access(result.cbzPath!);
  assert.equal(!!result.coverImagePath, true);
  await access(result.coverImagePath!);
  await access(result.agentGuidancePath!);
  await access(result.agentWorkflowPackagePath!);
  await access(result.screenplayPath!);
  await access(result.directorBriefPath!);
  await access(result.projectPath!);
  await access(result.agentPlaybookPath!);
  await access(result.songSheetPath!);
  await access(result.songAudioPath!);
  await access(result.musicCuePackagePath!);
  await access(result.seriesPackagePath!);
  await access(result.storyboardPackagePath!);
  await access(result.trailerPackagePath!);
  await access(result.videoPackagePath!);
  await access(result.animaticTimelinePath!);
  await access(result.studioBundlePath!);

  const pdf = await readFile(result.outputPath);
  const pdfText = pdf.toString('latin1');
  assert.equal(pdfText.includes('/MediaBox [0 0 960 540]'), true);

  const panelPath = result.pages[0]?.panelImagePaths[0];
  assert.ok(panelPath);
  const panel = PNG.sync.read(await readFile(panelPath));
  assert.equal(panel.width, 1536);
  assert.equal(panel.height, 864);

  const cover = PNG.sync.read(await readFile(result.coverImagePath!));
  assert.equal(cover.width, 1536);
  assert.equal(cover.height, 864);
  const guidance = await readFile(result.agentGuidancePath!, 'utf8');
  assert.equal(guidance.includes('Hermes Agent'), true);
  assert.equal(guidance.includes('OpenClaw'), true);
  assert.equal(guidance.includes(result.project.title), true);
  const agentWorkflowPackage = JSON.parse(await readFile(result.agentWorkflowPackagePath!, 'utf8'));
  assert.equal(agentWorkflowPackage.format, 'agent-workflow-package');
  assert.equal(agentWorkflowPackage.frameworks.hermesAgent.repository, 'https://github.com/nousresearch/hermes-agent');
  assert.equal(agentWorkflowPackage.commandBlueprints.minimax.length > 0, true);
  const projectJson = JSON.parse(await readFile(result.projectPath!, 'utf8'));
  assert.equal(projectJson.title, result.project.title);
  assert.equal(projectJson.agentGuidancePackage.frameworks.hermesAgent.repository, 'https://github.com/nousresearch/hermes-agent');
  assert.equal(projectJson.agentGuidancePackage.frameworks.openClaw.repository, 'https://github.com/openclaw/openclaw');
  const screenplay = await readFile(result.screenplayPath!, 'utf8');
  assert.equal(screenplay.includes('## Screenplay Handoff'), true);
  assert.equal(screenplay.includes(result.project.title), true);
  const directorBrief = await readFile(result.directorBriefPath!, 'utf8');
  assert.equal(directorBrief.includes('## Director Brief'), true);
  assert.equal(directorBrief.includes(result.project.title), true);
  const songSheet = await readFile(result.songSheetPath!, 'utf8');
  assert.equal(songSheet.includes(result.musicCuePackage.songDraft.lyrics), true);
  const musicCuePackage = JSON.parse(await readFile(result.musicCuePackagePath!, 'utf8'));
  assert.equal(musicCuePackage.format, 'music-brief');
  assert.equal(musicCuePackage.songDraft.title, result.musicCuePackage.songDraft.title);
  const seriesPackage = JSON.parse(await readFile(result.seriesPackagePath!, 'utf8'));
  assert.equal(seriesPackage.format, 'series-bible');
  assert.equal(seriesPackage.targetFormat, 'series');
  const wav = await readFile(result.songAudioPath!);
  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
  const storyboardPackage = JSON.parse(await readFile(result.storyboardPackagePath!, 'utf8'));
  assert.equal(storyboardPackage.title, result.project.title);
  assert.equal(storyboardPackage.shots.length >= 3, true);
  assert.equal(storyboardPackage.shots[0].panelImagePath.length > 0, true);
  const trailerPackage = JSON.parse(await readFile(result.trailerPackagePath!, 'utf8'));
  assert.equal(trailerPackage.format, 'trailer-package');
  assert.equal(trailerPackage.logline.includes(result.project.title), true);
  const videoPackage = JSON.parse(await readFile(result.videoPackagePath!, 'utf8'));
  assert.equal(videoPackage.format, 'video-generation-package');
  assert.equal(videoPackage.provider, 'minimax');
  assert.equal(videoPackage.clips.length >= 3, true);
  const animaticTimeline = JSON.parse(await readFile(result.animaticTimelinePath!, 'utf8'));
  assert.equal(animaticTimeline.format, 'animatic-timeline');
  assert.equal(animaticTimeline.tracks.video.length >= 3, true);
  assert.equal(animaticTimeline.tracks.audio[0].audioPath, result.songAudioPath);
  const studioBundle = JSON.parse(await readFile(result.studioBundlePath!, 'utf8'));
  assert.equal(studioBundle.format, 'studio-bundle');
  assert.equal(studioBundle.jobId, result.project.id);
  assert.equal(studioBundle.artifactPaths.studioBundlePath, result.studioBundlePath);
  assert.equal(studioBundle.artifactPaths.agentWorkflowPackagePath, result.agentWorkflowPackagePath);
  assert.equal(studioBundle.artifactPaths.screenplayPath, result.screenplayPath);
  assert.equal(studioBundle.artifactPaths.directorBriefPath, result.directorBriefPath);
  assert.equal(studioBundle.artifactPaths.musicCuePackagePath, result.musicCuePackagePath);
  assert.equal(studioBundle.artifactPaths.seriesPackagePath, result.seriesPackagePath);
  assert.equal(studioBundle.artifactPaths.videoPackagePath, result.videoPackagePath);
  assert.equal(studioBundle.artifactPaths.agentPlaybookPath, result.agentPlaybookPath);

  const stem = result.outputPath.replace(/\.[^./\\]+$/, '');
  await rm(result.outputPath, { force: true });
  if (result.cbzPath) await rm(result.cbzPath, { force: true });
  await rm(result.agentGuidancePath!, { force: true });
  await rm(result.agentWorkflowPackagePath!, { force: true });
  await rm(result.screenplayPath!, { force: true });
  await rm(result.directorBriefPath!, { force: true });
  await rm(result.projectPath!, { force: true });
  await rm(result.songSheetPath!, { force: true });
  await rm(result.songAudioPath!, { force: true });
  await rm(result.musicCuePackagePath!, { force: true });
  await rm(result.seriesPackagePath!, { force: true });
  await rm(result.storyboardPackagePath!, { force: true });
  await rm(result.trailerPackagePath!, { force: true });
  await rm(result.videoPackagePath!, { force: true });
  await rm(result.animaticTimelinePath!, { force: true });
  await rm(result.studioBundlePath!, { force: true });
  await rm(`${stem}.images`, { recursive: true, force: true });

  console.log('PASS index');
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
