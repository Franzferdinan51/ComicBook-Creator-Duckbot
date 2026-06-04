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

const playbookProbe = await execFileAsync('node', ['bin/comic-creator.mjs', '--agent-playbook'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
assert.equal(playbookProbe.stdout.includes('# Hermes + OpenClaw Playbook'), true);
assert.equal(playbookProbe.stdout.includes('Use Hermes Agent to decompose'), true);

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
assert.equal(result.screenplayPath, outputPath.replace(/\.pdf$/, '-screenplay.md'));
assert.equal(result.songSheetPath, outputPath.replace(/\.pdf$/, '-song-sheet.md'));
assert.equal(result.songAudioPath, outputPath.replace(/\.pdf$/, '-theme.wav'));
assert.equal(result.musicCuePackagePath, outputPath.replace(/\.pdf$/, '-music-cue-package.json'));
assert.equal(result.seriesPackagePath, outputPath.replace(/\.pdf$/, '-series-package.json'));
assert.equal(result.storyboardPackagePath, outputPath.replace(/\.pdf$/, '-storyboard-package.json'));
assert.equal(result.trailerPackagePath, outputPath.replace(/\.pdf$/, '-trailer-package.json'));
assert.equal(result.animaticTimelinePath, outputPath.replace(/\.pdf$/, '-animatic-timeline.json'));
assert.equal(result.studioBundlePath, outputPath.replace(/\.pdf$/, '-studio-bundle.json'));
await access(result.projectPath!);
await access(result.agentPlaybookPath!);
await access(result.agentGuidancePath!);
await access(result.screenplayPath!);
await access(result.songSheetPath!);
await access(result.songAudioPath!);
await access(result.musicCuePackagePath!);
await access(result.seriesPackagePath!);
await access(result.storyboardPackagePath!);
await access(result.trailerPackagePath!);
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
const screenplay = await readFile(result.screenplayPath!, 'utf8');
assert.equal(screenplay.includes('## Screenplay Handoff'), true);
const projectJson = JSON.parse(await readFile(result.projectPath!, 'utf8'));
assert.equal(projectJson.title, result.project.title);
assert.equal(projectJson.musicCuePackage.songDraft.title, result.musicCuePackage.songDraft.title);
const wav = await readFile(result.songAudioPath!);
assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
const timeline = JSON.parse(await readFile(result.animaticTimelinePath!, 'utf8'));
assert.equal(timeline.tracks.audio[0].audioPath, result.songAudioPath);
const trailer = JSON.parse(await readFile(result.trailerPackagePath!, 'utf8'));
assert.equal(trailer.format, 'trailer-package');
const musicCuePackage = JSON.parse(await readFile(result.musicCuePackagePath!, 'utf8'));
assert.equal(musicCuePackage.format, 'music-brief');
const seriesPackage = JSON.parse(await readFile(result.seriesPackagePath!, 'utf8'));
assert.equal(seriesPackage.format, 'series-bible');
const studioBundle = JSON.parse(await readFile(result.studioBundlePath!, 'utf8'));
assert.equal(studioBundle.format, 'studio-bundle');
assert.equal(studioBundle.artifactPaths.studioBundlePath, result.studioBundlePath);
assert.equal(studioBundle.artifactPaths.screenplayPath, result.screenplayPath);
assert.equal(studioBundle.artifactPaths.musicCuePackagePath, result.musicCuePackagePath);
assert.equal(studioBundle.artifactPaths.seriesPackagePath, result.seriesPackagePath);
assert.equal(studioBundle.artifactPaths.trailerPackagePath, result.trailerPackagePath);

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
assert.equal(bundleResult.artifactPaths.seriesPackagePath.endsWith('-series-package.json'), true);
assert.equal(bundleResult.artifactPaths.trailerPackagePath.endsWith('-trailer-package.json'), true);
assert.equal(bundleResult.artifactPaths.agentPlaybookPath.endsWith('docs/agents/hermes-openclaw-playbook.md'), true);

const stem = outputPath.replace(/\.[^./\\]+$/, '');
const trailerStem = trailerOutputPath.replace(/\.[^./\\]+$/, '');
const musicStem = musicOutputPath.replace(/\.[^./\\]+$/, '');
const seriesStem = seriesOutputPath.replace(/\.[^./\\]+$/, '');
const screenplayStem = screenplayOutputPath.replace(/\.[^./\\]+$/, '');
await rm(outputPath, { force: true });
if (result.cbzPath) await rm(result.cbzPath, { force: true });
await rm(result.agentGuidancePath!, { force: true });
await rm(result.projectPath!, { force: true });
await rm(result.songSheetPath!, { force: true });
await rm(result.screenplayPath!, { force: true });
await rm(result.songAudioPath!, { force: true });
await rm(result.musicCuePackagePath!, { force: true });
await rm(result.seriesPackagePath!, { force: true });
await rm(result.storyboardPackagePath!, { force: true });
await rm(result.trailerPackagePath!, { force: true });
await rm(result.animaticTimelinePath!, { force: true });
await rm(result.studioBundlePath!, { force: true });
await rm(`${stem}.images`, { recursive: true, force: true });
await rm(trailerOutputPath, { force: true });
await rm(musicOutputPath, { force: true });
await rm(`${trailerStem}.cbz`, { force: true });
await rm(`${trailerStem}.images`, { recursive: true, force: true });
await rm(`${trailerStem}-project.json`, { force: true });
await rm(`${trailerStem}-agent-guidance.md`, { force: true });
await rm(`${trailerStem}-song-sheet.md`, { force: true });
await rm(`${trailerStem}-theme.wav`, { force: true });
await rm(`${trailerStem}-music-cue-package.json`, { force: true });
await rm(`${trailerStem}-series-package.json`, { force: true });
await rm(`${trailerStem}-storyboard-package.json`, { force: true });
await rm(`${trailerStem}-trailer-package.json`, { force: true });
await rm(`${trailerStem}-animatic-timeline.json`, { force: true });
await rm(`${trailerStem}-studio-bundle.json`, { force: true });
await rm(`${musicStem}.cbz`, { force: true });
await rm(`${musicStem}.images`, { recursive: true, force: true });
await rm(`${musicStem}-project.json`, { force: true });
await rm(`${musicStem}-agent-guidance.md`, { force: true });
await rm(`${musicStem}-song-sheet.md`, { force: true });
await rm(`${musicStem}-theme.wav`, { force: true });
await rm(`${musicStem}-music-cue-package.json`, { force: true });
await rm(`${musicStem}-series-package.json`, { force: true });
await rm(`${musicStem}-storyboard-package.json`, { force: true });
await rm(`${musicStem}-trailer-package.json`, { force: true });
await rm(`${musicStem}-animatic-timeline.json`, { force: true });
await rm(`${musicStem}-studio-bundle.json`, { force: true });
await rm(seriesOutputPath, { force: true });
await rm(`${seriesStem}.cbz`, { force: true });
await rm(`${seriesStem}.images`, { recursive: true, force: true });
await rm(`${seriesStem}-project.json`, { force: true });
await rm(`${seriesStem}-agent-guidance.md`, { force: true });
await rm(`${seriesStem}-song-sheet.md`, { force: true });
await rm(`${seriesStem}-theme.wav`, { force: true });
await rm(`${seriesStem}-music-cue-package.json`, { force: true });
await rm(`${seriesStem}-series-package.json`, { force: true });
await rm(`${seriesStem}-storyboard-package.json`, { force: true });
await rm(`${seriesStem}-trailer-package.json`, { force: true });
await rm(`${seriesStem}-animatic-timeline.json`, { force: true });
await rm(`${seriesStem}-studio-bundle.json`, { force: true });
await rm(screenplayOutputPath, { force: true });
await rm(`${screenplayStem}.cbz`, { force: true });
await rm(`${screenplayStem}.images`, { recursive: true, force: true });
await rm(`${screenplayStem}-project.json`, { force: true });
await rm(`${screenplayStem}-agent-guidance.md`, { force: true });
await rm(`${screenplayStem}-screenplay.md`, { force: true });
await rm(`${screenplayStem}-song-sheet.md`, { force: true });
await rm(`${screenplayStem}-theme.wav`, { force: true });
await rm(`${screenplayStem}-music-cue-package.json`, { force: true });
await rm(`${screenplayStem}-series-package.json`, { force: true });
await rm(`${screenplayStem}-storyboard-package.json`, { force: true });
await rm(`${screenplayStem}-trailer-package.json`, { force: true });
await rm(`${screenplayStem}-animatic-timeline.json`, { force: true });
await rm(`${screenplayStem}-studio-bundle.json`, { force: true });

console.log('PASS cli');
