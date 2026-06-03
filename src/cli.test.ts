import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { parseArgs, runCli } from './cli.js';

const execFileAsync = promisify(execFile);

const parsed = parseArgs([
  '--output-profile=storyboard-widescreen',
  '--music-provider=mock',
  '--pages=1',
  '--panels=3',
  'A crew turns a comic into a pilot episode.',
]);

assert.equal(parsed.outputProfile, 'storyboard-widescreen');
assert.equal(parsed.musicProvider, 'mock');

const playbookProbe = await execFileAsync(process.execPath, ['bin/comic-creator.mjs', '--agent-playbook'], {
  cwd: process.cwd(),
  maxBuffer: 1024 * 1024,
});
assert.equal(playbookProbe.stdout.includes('# Hermes + OpenClaw Playbook'), true);
assert.equal(playbookProbe.stdout.includes('Use Hermes Agent to decompose'), true);

const outputPath = `/tmp/comic-creator-cli-${Date.now()}.pdf`;
const result = await runCli({
  ...parsed,
  output: outputPath,
  textProvider: 'mock',
  imageProvider: 'mock',
  format: 'pdf',
}, () => undefined);

assert.equal(result.project.renderProfile.outputProfile, 'storyboard-widescreen');
assert.equal(result.musicProvider, 'mock');
assert.equal(result.agentGuidancePackage.externalInterfaces.includes('cli'), true);
assert.equal(result.projectPath, outputPath.replace(/\.pdf$/, '-project.json'));
assert.equal(result.agentGuidancePath, outputPath.replace(/\.pdf$/, '-agent-guidance.md'));
assert.equal(result.songSheetPath, outputPath.replace(/\.pdf$/, '-song-sheet.md'));
assert.equal(result.songAudioPath, outputPath.replace(/\.pdf$/, '-theme.wav'));
assert.equal(result.storyboardPackagePath, outputPath.replace(/\.pdf$/, '-storyboard-package.json'));
assert.equal(result.animaticTimelinePath, outputPath.replace(/\.pdf$/, '-animatic-timeline.json'));
await access(result.projectPath!);
await access(result.agentGuidancePath!);
await access(result.songSheetPath!);
await access(result.songAudioPath!);
await access(result.storyboardPackagePath!);
await access(result.animaticTimelinePath!);
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

const stem = outputPath.replace(/\.[^./\\]+$/, '');
await rm(outputPath, { force: true });
if (result.cbzPath) await rm(result.cbzPath, { force: true });
await rm(result.agentGuidancePath!, { force: true });
await rm(result.projectPath!, { force: true });
await rm(result.songSheetPath!, { force: true });
await rm(result.songAudioPath!, { force: true });
await rm(result.storyboardPackagePath!, { force: true });
await rm(result.animaticTimelinePath!, { force: true });
await rm(`${stem}.images`, { recursive: true, force: true });

console.log('PASS cli');
