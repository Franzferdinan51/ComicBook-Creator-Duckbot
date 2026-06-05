import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { PNG } from 'pngjs';
import { parseArgs, runCli } from './cli.js';

const execFileAsync = promisify(execFile);

const parsed = parseArgs([
  '--project-goal=screen',
  '--music-provider=mock',
  '--pages=1',
  '--panels=3',
  'A crew turns a comic into a pilot episode.',
]);

assert.equal(parsed.projectGoal, 'screen');
assert.equal(parsed.musicProvider, 'mock');
assert.equal(parseArgs(['--json', 'A JSON story']).json, true);
assert.equal(parseArgs(['--preflight']).preflight, true);
assert.equal(parseArgs(['--production-run-manifest', 'A manifest story']).productionRunManifest, true);

const playbookProbe = await execFileAsync('node', ['bin/comic-creator.mjs', '--agent-playbook'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
assert.equal(playbookProbe.stdout.includes('# Hermes + OpenClaw Playbook'), true);
assert.equal(playbookProbe.stdout.includes('Use Hermes Agent to decompose'), true);

const preflightProbe = await execFileAsync('node', ['bin/comic-creator.mjs', '--preflight'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
const preflight = JSON.parse(preflightProbe.stdout);
assert.equal(['pass', 'warn', 'fail'].includes(preflight.status), true);
assert.equal(preflight.checks.some((check: { id: string }) => check.id === 'provider-registry'), true);

const trailerOutputPath = `/tmp/comic-creator-cli-trailer-${Date.now()}.pdf`;
const trailerProbe = await execFileAsync('node', ['bin/comic-creator.mjs', '--trailer-package', `--output=${trailerOutputPath}`, '--pages=1', '--panels=3', 'A Trailer package story'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
const trailerResult = JSON.parse(trailerProbe.stdout);
assert.equal(trailerResult.format, 'trailer-package');
assert.equal(trailerResult.durationSeconds > 0, true);
assert.equal(Array.isArray(trailerResult.teaserBeats), true);

const musicOutputPath = `/tmp/comic-creator-cli-music-${Date.now()}.pdf`;
const musicProbe = await execFileAsync('node', ['bin/comic-creator.mjs', '--music-cue-package', `--output=${musicOutputPath}`, '--pages=1', '--panels=3', 'A Music package story'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
const musicResult = JSON.parse(musicProbe.stdout);
assert.equal(musicResult.format, 'music-brief');
assert.equal(Array.isArray(musicResult.cues), true);

const seriesOutputPath = `/tmp/comic-creator-cli-series-${Date.now()}.pdf`;
const seriesProbe = await execFileAsync('node', ['bin/comic-creator.mjs', '--series-package', `--output=${seriesOutputPath}`, '--pages=1', '--panels=3', 'A Series package story'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
const seriesResult = JSON.parse(seriesProbe.stdout);
assert.equal(seriesResult.format, 'series-bible');
assert.equal(Array.isArray(seriesResult.episodeOutline), true);

const screenplayOutputPath = `/tmp/comic-creator-cli-screenplay-${Date.now()}.pdf`;
const screenplayProbe = await execFileAsync('node', ['bin/comic-creator.mjs', '--screenplay', `--output=${screenplayOutputPath}`, '--pages=1', '--panels=3', 'A Screenplay package story'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
assert.equal(screenplayProbe.stdout.includes('## Screenplay Handoff'), true);
assert.equal(screenplayProbe.stdout.includes('A Screenplay package story'), true);

const directorBriefOutputPath = `/tmp/comic-creator-cli-director-brief-${Date.now()}.pdf`;
const directorBriefProbe = await execFileAsync('node', ['bin/comic-creator.mjs', '--director-brief', `--output=${directorBriefOutputPath}`, '--pages=1', '--panels=3', 'A Director brief story'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
assert.equal(directorBriefProbe.stdout.includes('## Director Brief'), true);
assert.equal(directorBriefProbe.stdout.includes('A Director brief story'), true);

const videoPackageOutputPath = `/tmp/comic-creator-cli-video-package-${Date.now()}.pdf`;
const videoPackageProbe = await execFileAsync('node', ['bin/comic-creator.mjs', '--video-package', `--output=${videoPackageOutputPath}`, '--pages=1', '--panels=3', 'A Video package story'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
const videoPackageResult = JSON.parse(videoPackageProbe.stdout);
assert.equal(videoPackageResult.format, 'video-generation-package');
assert.equal(Array.isArray(videoPackageResult.clips), true);

const manifestOutputPath = `/tmp/comic-creator-cli-production-manifest-${Date.now()}.pdf`;
const manifestProbe = await execFileAsync('node', ['bin/comic-creator.mjs', '--production-run-manifest', `--output=${manifestOutputPath}`, '--pages=1', '--panels=3', 'A production manifest story'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
const manifestResult = JSON.parse(manifestProbe.stdout);
assert.equal(manifestResult.format, 'production-run-manifest');
assert.equal(manifestResult.provider, 'minimax');
assert.equal(manifestResult.phases.some((phase: { phaseId: string }) => phase.phaseId === 'video-clips'), true);
assert.equal(manifestResult.gates.some((gate: { command: string }) => gate.command === 'mmx auth status'), true);

const outputPath = `/tmp/comic-creator-cli-${Date.now()}.pdf`;
const result = await runCli({
  ...parsed,
  output: outputPath,
  textProvider: 'mock',
  imageProvider: 'mock',
  format: 'pdf',
}, () => undefined);

assert.equal(result.project.renderProfile.outputProfile, 'storyboard-widescreen');
assert.equal(result.project.projectGoal, 'screen');
assert.equal(result.musicProvider, 'mock');
assert.equal(result.agentGuidancePackage.externalInterfaces.includes('cli'), true);
assert.equal(result.projectPath, outputPath.replace(/\.pdf$/, '-project.json'));
assert.equal(result.agentPlaybookPath?.endsWith('docs/agents/hermes-openclaw-playbook.md'), true);
assert.equal(result.agentGuidancePath, outputPath.replace(/\.pdf$/, '-agent-guidance.md'));
assert.equal(result.agentWorkflowPackagePath, outputPath.replace(/\.pdf$/, '-agent-workflow-package.json'));
assert.equal(result.productionRunManifestPath, outputPath.replace(/\.pdf$/, '-production-run-manifest.json'));
assert.equal(result.screenplayPath, outputPath.replace(/\.pdf$/, '-screenplay.md'));
assert.equal(result.directorBriefPath, outputPath.replace(/\.pdf$/, '-director-brief.md'));
assert.equal(result.songSheetPath, outputPath.replace(/\.pdf$/, '-song-sheet.md'));
assert.equal(result.songAudioPath, outputPath.replace(/\.pdf$/, '-theme.wav'));
assert.equal(result.musicCuePackagePath, outputPath.replace(/\.pdf$/, '-music-cue-package.json'));
assert.equal(result.seriesPackagePath, outputPath.replace(/\.pdf$/, '-series-package.json'));
assert.equal(result.storyboardPackagePath, outputPath.replace(/\.pdf$/, '-storyboard-package.json'));
assert.equal(result.trailerPackagePath, outputPath.replace(/\.pdf$/, '-trailer-package.json'));
assert.equal(result.videoPackagePath, outputPath.replace(/\.pdf$/, '-video-package.json'));
assert.equal(result.animaticTimelinePath, outputPath.replace(/\.pdf$/, '-animatic-timeline.json'));
assert.equal(result.studioBundlePath, outputPath.replace(/\.pdf$/, '-studio-bundle.json'));
await access(result.projectPath!);
await access(result.agentPlaybookPath!);
await access(result.agentGuidancePath!);
await access(result.agentWorkflowPackagePath!);
await access(result.productionRunManifestPath!);
await access(result.screenplayPath!);
await access(result.directorBriefPath!);
await access(result.songSheetPath!);
await access(result.songAudioPath!);
await access(result.musicCuePackagePath!);
await access(result.seriesPackagePath!);
await access(result.storyboardPackagePath!);
await access(result.trailerPackagePath!);
await access(result.videoPackagePath!);
await access(result.animaticTimelinePath!);
await access(result.studioBundlePath!);
const firstPanelPath = result.pages[0]?.panelImagePaths[0];
assert.ok(firstPanelPath, 'expected a generated panel image path');
const firstPanel = PNG.sync.read(await readFile(firstPanelPath));
assert.equal(firstPanel.width, 1536);
assert.equal(firstPanel.height, 864);
const pdfBytes = await readFile(result.pdfPath!);
assert.equal(pdfBytes.toString('latin1').includes('/MediaBox [0 0 960 540]'), true);
const guidance = await readFile(result.agentGuidancePath!, 'utf8');
assert.equal(guidance.includes('Hermes Agent'), true);
assert.equal(guidance.includes('OpenClaw'), true);
const agentWorkflowPackage = JSON.parse(await readFile(result.agentWorkflowPackagePath!, 'utf8'));
assert.equal(agentWorkflowPackage.format, 'agent-workflow-package');
assert.equal(agentWorkflowPackage.commandBlueprints.mcp.includes('get_studio_bundle'), true);
const productionRunManifest = JSON.parse(await readFile(result.productionRunManifestPath!, 'utf8'));
assert.equal(productionRunManifest.format, 'production-run-manifest');
assert.equal(productionRunManifest.phases.some((phase: { phaseId: string }) => phase.phaseId === 'video-clips'), true);
const screenplay = await readFile(result.screenplayPath!, 'utf8');
assert.equal(screenplay.includes('## Screenplay Handoff'), true);
const directorBrief = await readFile(result.directorBriefPath!, 'utf8');
assert.equal(directorBrief.includes('## Director Brief'), true);
const projectJson = JSON.parse(await readFile(result.projectPath!, 'utf8'));
assert.equal(projectJson.title, result.project.title);
assert.equal(projectJson.musicCuePackage.songDraft.title, result.musicCuePackage.songDraft.title);
const wav = await readFile(result.songAudioPath!);
assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
const timeline = JSON.parse(await readFile(result.animaticTimelinePath!, 'utf8'));
assert.equal(timeline.tracks.audio[0].audioPath, result.songAudioPath);
const trailer = JSON.parse(await readFile(result.trailerPackagePath!, 'utf8'));
assert.equal(trailer.format, 'trailer-package');
const videoPackage = JSON.parse(await readFile(result.videoPackagePath!, 'utf8'));
assert.equal(videoPackage.format, 'video-generation-package');
assert.equal(videoPackage.provider, 'minimax');
const musicCuePackage = JSON.parse(await readFile(result.musicCuePackagePath!, 'utf8'));
assert.equal(musicCuePackage.format, 'music-brief');
const seriesPackage = JSON.parse(await readFile(result.seriesPackagePath!, 'utf8'));
assert.equal(seriesPackage.format, 'series-bible');
const studioBundle = JSON.parse(await readFile(result.studioBundlePath!, 'utf8'));
assert.equal(studioBundle.format, 'studio-bundle');
assert.equal(studioBundle.artifactPaths.studioBundlePath, result.studioBundlePath);
assert.equal(studioBundle.artifactPaths.agentWorkflowPackagePath, result.agentWorkflowPackagePath);
assert.equal(studioBundle.artifactPaths.productionRunManifestPath, result.productionRunManifestPath);
assert.equal(studioBundle.artifactPaths.screenplayPath, result.screenplayPath);
assert.equal(studioBundle.artifactPaths.directorBriefPath, result.directorBriefPath);
assert.equal(studioBundle.artifactPaths.musicCuePackagePath, result.musicCuePackagePath);
assert.equal(studioBundle.artifactPaths.seriesPackagePath, result.seriesPackagePath);
assert.equal(studioBundle.artifactPaths.trailerPackagePath, result.trailerPackagePath);
assert.equal(studioBundle.artifactPaths.videoPackagePath, result.videoPackagePath);

const jsonProbe = await execFileAsync('node', ['bin/comic-creator.mjs', '--json', '--pages=1', '--panels=3', 'A JSON agent story'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
const jsonResult = JSON.parse(jsonProbe.stdout);
assert.equal(jsonResult.outputPath.endsWith('.pdf'), true);
assert.equal(jsonResult.agentPlaybookPath.endsWith('docs/agents/hermes-openclaw-playbook.md'), true);
assert.equal(jsonResult.agentGuidancePath.endsWith('-agent-guidance.md'), true);

const bundleProbe = await execFileAsync('node', ['bin/comic-creator.mjs', '--studio-bundle', '--pages=1', '--panels=3', 'A Studio bundle story'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
const bundleResult = JSON.parse(bundleProbe.stdout);
assert.equal(bundleResult.format, 'studio-bundle');
assert.equal(bundleResult.artifactPaths.studioBundlePath.endsWith('-studio-bundle.json'), true);
assert.equal(bundleResult.artifactPaths.productionRunManifestPath.endsWith('-production-run-manifest.json'), true);
assert.equal(bundleResult.artifactPaths.seriesPackagePath.endsWith('-series-package.json'), true);
assert.equal(bundleResult.artifactPaths.trailerPackagePath.endsWith('-trailer-package.json'), true);
assert.equal(bundleResult.artifactPaths.videoPackagePath.endsWith('-video-package.json'), true);
assert.equal(bundleResult.artifactPaths.agentPlaybookPath.endsWith('docs/agents/hermes-openclaw-playbook.md'), true);

const stem = outputPath.replace(/\.[^./\\]+$/, '');
const trailerStem = trailerOutputPath.replace(/\.[^./\\]+$/, '');
const musicStem = musicOutputPath.replace(/\.[^./\\]+$/, '');
const seriesStem = seriesOutputPath.replace(/\.[^./\\]+$/, '');
const screenplayStem = screenplayOutputPath.replace(/\.[^./\\]+$/, '');
const directorBriefStem = directorBriefOutputPath.replace(/\.[^./\\]+$/, '');
const videoPackageStem = videoPackageOutputPath.replace(/\.[^./\\]+$/, '');
const manifestStem = manifestOutputPath.replace(/\.[^./\\]+$/, '');
await rm(outputPath, { force: true });
if (result.cbzPath) await rm(result.cbzPath, { force: true });
await rm(result.agentGuidancePath!, { force: true });
await rm(result.agentWorkflowPackagePath!, { force: true });
await rm(result.productionRunManifestPath!, { force: true });
await rm(result.projectPath!, { force: true });
await rm(result.songSheetPath!, { force: true });
await rm(result.screenplayPath!, { force: true });
await rm(result.directorBriefPath!, { force: true });
await rm(result.songAudioPath!, { force: true });
await rm(result.musicCuePackagePath!, { force: true });
await rm(result.seriesPackagePath!, { force: true });
await rm(result.storyboardPackagePath!, { force: true });
await rm(result.trailerPackagePath!, { force: true });
await rm(result.videoPackagePath!, { force: true });
await rm(result.animaticTimelinePath!, { force: true });
await rm(result.studioBundlePath!, { force: true });
await rm(`${stem}.images`, { recursive: true, force: true });
await rm(trailerOutputPath, { force: true });
await rm(musicOutputPath, { force: true });
await rm(`${trailerStem}.cbz`, { force: true });
await rm(`${trailerStem}.images`, { recursive: true, force: true });
await rm(`${trailerStem}-project.json`, { force: true });
await rm(`${trailerStem}-agent-guidance.md`, { force: true });
await rm(`${trailerStem}-agent-workflow-package.json`, { force: true });
await rm(`${trailerStem}-production-run-manifest.json`, { force: true });
await rm(`${trailerStem}-director-brief.md`, { force: true });
await rm(`${trailerStem}-song-sheet.md`, { force: true });
await rm(`${trailerStem}-theme.wav`, { force: true });
await rm(`${trailerStem}-music-cue-package.json`, { force: true });
await rm(`${trailerStem}-series-package.json`, { force: true });
await rm(`${trailerStem}-storyboard-package.json`, { force: true });
await rm(`${trailerStem}-trailer-package.json`, { force: true });
await rm(`${trailerStem}-video-package.json`, { force: true });
await rm(`${trailerStem}-animatic-timeline.json`, { force: true });
await rm(`${trailerStem}-studio-bundle.json`, { force: true });
await rm(`${musicStem}.cbz`, { force: true });
await rm(`${musicStem}.images`, { recursive: true, force: true });
await rm(`${musicStem}-project.json`, { force: true });
await rm(`${musicStem}-agent-guidance.md`, { force: true });
await rm(`${musicStem}-agent-workflow-package.json`, { force: true });
await rm(`${musicStem}-production-run-manifest.json`, { force: true });
await rm(`${musicStem}-director-brief.md`, { force: true });
await rm(`${musicStem}-song-sheet.md`, { force: true });
await rm(`${musicStem}-theme.wav`, { force: true });
await rm(`${musicStem}-music-cue-package.json`, { force: true });
await rm(`${musicStem}-series-package.json`, { force: true });
await rm(`${musicStem}-storyboard-package.json`, { force: true });
await rm(`${musicStem}-trailer-package.json`, { force: true });
await rm(`${musicStem}-video-package.json`, { force: true });
await rm(`${musicStem}-animatic-timeline.json`, { force: true });
await rm(`${musicStem}-studio-bundle.json`, { force: true });
await rm(seriesOutputPath, { force: true });
await rm(`${seriesStem}.cbz`, { force: true });
await rm(`${seriesStem}.images`, { recursive: true, force: true });
await rm(`${seriesStem}-project.json`, { force: true });
await rm(`${seriesStem}-agent-guidance.md`, { force: true });
await rm(`${seriesStem}-agent-workflow-package.json`, { force: true });
await rm(`${seriesStem}-production-run-manifest.json`, { force: true });
await rm(`${seriesStem}-director-brief.md`, { force: true });
await rm(`${seriesStem}-song-sheet.md`, { force: true });
await rm(`${seriesStem}-theme.wav`, { force: true });
await rm(`${seriesStem}-music-cue-package.json`, { force: true });
await rm(`${seriesStem}-series-package.json`, { force: true });
await rm(`${seriesStem}-storyboard-package.json`, { force: true });
await rm(`${seriesStem}-trailer-package.json`, { force: true });
await rm(`${seriesStem}-video-package.json`, { force: true });
await rm(`${seriesStem}-animatic-timeline.json`, { force: true });
await rm(`${seriesStem}-studio-bundle.json`, { force: true });
await rm(screenplayOutputPath, { force: true });
await rm(`${screenplayStem}.cbz`, { force: true });
await rm(`${screenplayStem}.images`, { recursive: true, force: true });
await rm(`${screenplayStem}-project.json`, { force: true });
await rm(`${screenplayStem}-agent-guidance.md`, { force: true });
await rm(`${screenplayStem}-agent-workflow-package.json`, { force: true });
await rm(`${screenplayStem}-production-run-manifest.json`, { force: true });
await rm(`${screenplayStem}-screenplay.md`, { force: true });
await rm(`${screenplayStem}-director-brief.md`, { force: true });
await rm(`${screenplayStem}-song-sheet.md`, { force: true });
await rm(`${screenplayStem}-theme.wav`, { force: true });
await rm(`${screenplayStem}-music-cue-package.json`, { force: true });
await rm(`${screenplayStem}-series-package.json`, { force: true });
await rm(`${screenplayStem}-storyboard-package.json`, { force: true });
await rm(`${screenplayStem}-trailer-package.json`, { force: true });
await rm(`${screenplayStem}-video-package.json`, { force: true });
await rm(`${screenplayStem}-animatic-timeline.json`, { force: true });
await rm(`${screenplayStem}-studio-bundle.json`, { force: true });
await rm(directorBriefOutputPath, { force: true });
await rm(`${directorBriefStem}.cbz`, { force: true });
await rm(`${directorBriefStem}.images`, { recursive: true, force: true });
await rm(`${directorBriefStem}-project.json`, { force: true });
await rm(`${directorBriefStem}-agent-guidance.md`, { force: true });
await rm(`${directorBriefStem}-agent-workflow-package.json`, { force: true });
await rm(`${directorBriefStem}-production-run-manifest.json`, { force: true });
await rm(`${directorBriefStem}-screenplay.md`, { force: true });
await rm(`${directorBriefStem}-director-brief.md`, { force: true });
await rm(`${directorBriefStem}-song-sheet.md`, { force: true });
await rm(`${directorBriefStem}-theme.wav`, { force: true });
await rm(`${directorBriefStem}-music-cue-package.json`, { force: true });
await rm(`${directorBriefStem}-series-package.json`, { force: true });
await rm(`${directorBriefStem}-storyboard-package.json`, { force: true });
await rm(`${directorBriefStem}-trailer-package.json`, { force: true });
await rm(`${directorBriefStem}-video-package.json`, { force: true });
await rm(`${directorBriefStem}-animatic-timeline.json`, { force: true });
await rm(`${directorBriefStem}-studio-bundle.json`, { force: true });
await rm(videoPackageOutputPath, { force: true });
await rm(`${videoPackageStem}.cbz`, { force: true });
await rm(`${videoPackageStem}.images`, { recursive: true, force: true });
await rm(`${videoPackageStem}-project.json`, { force: true });
await rm(`${videoPackageStem}-agent-guidance.md`, { force: true });
await rm(`${videoPackageStem}-agent-workflow-package.json`, { force: true });
await rm(`${videoPackageStem}-production-run-manifest.json`, { force: true });
await rm(`${videoPackageStem}-screenplay.md`, { force: true });
await rm(`${videoPackageStem}-director-brief.md`, { force: true });
await rm(`${videoPackageStem}-song-sheet.md`, { force: true });
await rm(`${videoPackageStem}-theme.wav`, { force: true });
await rm(`${videoPackageStem}-music-cue-package.json`, { force: true });
await rm(`${videoPackageStem}-series-package.json`, { force: true });
await rm(`${videoPackageStem}-storyboard-package.json`, { force: true });
await rm(`${videoPackageStem}-trailer-package.json`, { force: true });
await rm(`${videoPackageStem}-video-package.json`, { force: true });
await rm(`${videoPackageStem}-animatic-timeline.json`, { force: true });
await rm(`${videoPackageStem}-studio-bundle.json`, { force: true });
await rm(manifestOutputPath, { force: true });
await rm(`${manifestStem}.cbz`, { force: true });
await rm(`${manifestStem}.images`, { recursive: true, force: true });
await rm(`${manifestStem}-project.json`, { force: true });
await rm(`${manifestStem}-agent-guidance.md`, { force: true });
await rm(`${manifestStem}-agent-workflow-package.json`, { force: true });
await rm(`${manifestStem}-production-run-manifest.json`, { force: true });
await rm(`${manifestStem}-screenplay.md`, { force: true });
await rm(`${manifestStem}-director-brief.md`, { force: true });
await rm(`${manifestStem}-song-sheet.md`, { force: true });
await rm(`${manifestStem}-theme.wav`, { force: true });
await rm(`${manifestStem}-music-cue-package.json`, { force: true });
await rm(`${manifestStem}-series-package.json`, { force: true });
await rm(`${manifestStem}-storyboard-package.json`, { force: true });
await rm(`${manifestStem}-trailer-package.json`, { force: true });
await rm(`${manifestStem}-video-package.json`, { force: true });
await rm(`${manifestStem}-animatic-timeline.json`, { force: true });
await rm(`${manifestStem}-studio-bundle.json`, { force: true });

console.log('PASS cli');
