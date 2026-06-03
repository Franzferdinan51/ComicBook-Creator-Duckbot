import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { StoryProject } from '../types.js';
import { generateMockThemeWav } from '../project/index.js';

export interface MusicGenerateOptions {
  seed?: number;
  durationSeconds?: number;
}

export interface MusicProvider {
  name: string;
  outputExtension: 'wav' | 'mp3';
  mimeType: 'audio/wav' | 'audio/mpeg';
  generate(project: StoryProject, options?: MusicGenerateOptions): Promise<Buffer>;
}

export class MockMusic implements MusicProvider {
  name = 'mock';
  outputExtension = 'wav' as const;
  mimeType = 'audio/wav' as const;

  async generate(project: StoryProject, _options: MusicGenerateOptions = {}): Promise<Buffer> {
    return generateMockThemeWav(project);
  }
}

export class MiniMaxMusic implements MusicProvider {
  name = 'minimax';
  outputExtension = 'mp3' as const;
  mimeType = 'audio/mpeg' as const;

  async generate(project: StoryProject, _options: MusicGenerateOptions = {}): Promise<Buffer> {
    const binary = process.env.MINIMAX_MUSIC_BINARY?.trim() || 'mmx';
    const scratchDir = await mkdtemp(join(tmpdir(), 'comic-music-'));
    const outputPath = join(scratchDir, 'theme.mp3');
    const song = project.musicCuePackage.songDraft;
    const cueSummary = project.musicCuePackage.cues
      .map((cue) => `${cue.mood}${cue.instrumentation?.length ? ` with ${cue.instrumentation.join(', ')}` : ''}`)
      .join('; ');
    const instruments = project.musicCuePackage.cues
      .flatMap((cue) => cue.instrumentation ?? [])
      .filter((item, index, items) => items.indexOf(item) === index)
      .join(', ');

    const args = [
      'music',
      'generate',
      '--prompt',
      project.musicCuePackage.musicGenerationPrompt,
      '--lyrics',
      song.lyrics,
      '--genre',
      song.genre,
      '--mood',
      cueSummary || song.genre,
      '--bpm',
      String(song.bpm),
      '--key',
      song.key,
      '--out',
      outputPath,
      '--quiet',
      '--non-interactive',
    ];
    if (instruments) {
      args.push('--instruments', instruments);
    }

    try {
      const { code, stderr } = await runBinary(binary, args);
      if (code !== 0) {
        throw new Error(`${binary} exited with code ${code}${stderr ? `: ${stderr}` : ''}`);
      }
      return await readFile(outputPath);
    } finally {
      await rm(scratchDir, { recursive: true, force: true });
    }
  }
}

async function runBinary(binary: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', (err) => {
      reject(err);
    });
    child.once('close', (code) => {
      resolve({ code: code ?? 1, stderr: stderr.trim() });
    });
  });
}
