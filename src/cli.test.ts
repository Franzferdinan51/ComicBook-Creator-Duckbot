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
assert.equal(result.songSheetPath, outputPath.replace(/\.pdf$/, '-song-sheet.md'));
assert.equal(result.songAudioPath, outputPath.replace(/\.pdf$/, '-theme.wav'));
assert.equal(result.storyboardPackagePath, outputPath.replace(/\.pdf$/, '-storyboard-package.json'));
assert.equal(result.trailerPackagePath, outputPath.replace(/\.pdf$/, '-trailer-package.json'));
assert.equal(result.animaticTimelinePath, outputPath.replace(/\.pdf$/, '-animatic-timeline.json'));
assert.equal(result.studioBundlePath, outputPath.replace(/\.pdf$/, '-studio-bundle.json'));
await access(result.projectPath!);
await access(result.agentPlaybookPath!);
await access(result.agentGuidancePath!);
await access(result.songSheetPath!);
await access(result.songAudioPath!);
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
const projectJson = JSON.parse(await readFile(result.projectPath!, 'utf8'));
assert.equal(projectJson.title, result.project.title);
assert.equal(projectJson.musicCuePackage.songDraft.title, result.musicCuePackage.songDraft.title);
const wav = await readFile(result.songAudioPath!);
assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
const timeline = JSON.parse(await readFile(result.animaticTimelinePath!, 'utf8'));
assert.equal(timeline.tracks.audio[0].audioPath, result.songAudioPath);
const trailer = JSON.parse(await readFile(result.trailerPackagePath!, 'utf8'));
assert.equal(trailer.format, 'trailer-package');
const studioBundle = JSON.parse(await readFile(result.studioBundlePath!, 'utf8'));
assert.equal(studioBundle.format, 'studio-bundle');
assert.equal(studioBundle.artifactPaths.studioBundlePath, result.studioBundlePath);
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
assert.equal(bundleResult.artifactPaths.trailerPackagePath.endsWith('-trailer-package.json'), true);
assert.equal(bundleResult.artifactPaths.agentPlaybookPath.endsWith('docs/agents/hermes-openclaw-playbook.md'), true);

const stem = outputPath.replace(/\.[^./\\]+$/, '');
const trailerStem = trailerOutputPath.replace(/\.[^./\\]+$/, '');
await rm(outputPath, { force: true });
if (result.cbzPath) await rm(result.cbzPath, { force: true });
await rm(result.agentGuidancePath!, { force: true });
await rm(result.projectPath!, { force: true });
await rm(result.songSheetPath!, { force: true });
await rm(result.songAudioPath!, { force: true });
await rm(result.storyboardPackagePath!, { force: true });
await rm(result.trailerPackagePath!, { force: true });
await rm(result.animaticTimelinePath!, { force: true });
await rm(result.studioBundlePath!, { force: true });
await rm(`${stem}.images`, { recursive: true, force: true });
await rm(trailerOutputPath, { force: true });
await rm(`${trailerStem}.cbz`, { force: true });
await rm(`${trailerStem}.images`, { recursive: true, force: true });
await rm(`${trailerStem}-project.json`, { force: true });
await rm(`${trailerStem}-agent-guidance.md`, { force: true });
await rm(`${trailerStem}-song-sheet.md`, { force: true });
await rm(`${trailerStem}-theme.wav`, { force: true });
await rm(`${trailerStem}-storyboard-package.json`, { force: true });
await rm(`${trailerStem}-trailer-package.json`, { force: true });
await rm(`${trailerStem}-animatic-timeline.json`, { force: true });
await rm(`${trailerStem}-studio-bundle.json`, { force: true });

console.log('PASS cli');
