import type { StoryProject } from '../types.js';

export function audioExtensionForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'mp3') return 'mp3';
  if (ext === 'wav') return 'wav';
  return ext || 'bin';
}

export function audioMimeTypeForPath(path: string): string {
  const ext = audioExtensionForPath(path);
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  return 'application/octet-stream';
}

export function renderSongSheetMarkdown(project: StoryProject): string {
  const song = project.musicCuePackage.songDraft;
  return `# ${song.title}

## Project

- Source project: ${project.title}
- Genre: ${song.genre}
- BPM: ${song.bpm}
- Key: ${song.key}
- Sections: ${song.sections.join(', ')}

## Lyrics

${song.lyrics}

## Cue Map

${project.musicCuePackage.sceneCueMap.map((item) => `- ${item.sceneId} -> ${item.cueId} (${item.timing}): ${item.purpose}`).join('\n')}

## Generation Prompt

${project.musicCuePackage.musicGenerationPrompt}
`;
}

export function generateMockThemeWav(project: StoryProject): Buffer {
  const sampleRate = 22050;
  const seconds = 6;
  const sampleCount = sampleRate * seconds;
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  const baseFrequency = frequencyForKey(project.musicCuePackage.songDraft.key);
  const bpm = project.musicCuePackage.songDraft.bpm;
  const beatSeconds = 60 / bpm;

  writeWavHeader(buffer, sampleRate, dataSize);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    const beat = Math.floor(t / beatSeconds);
    const interval = [0, 3, 7, 10][beat % 4] ?? 0;
    const freq = baseFrequency * Math.pow(2, interval / 12);
    const envelope = Math.max(0, 1 - (t % beatSeconds) / beatSeconds);
    const wave =
      Math.sin(2 * Math.PI * freq * t) * 0.55 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.18;
    const sample = Math.max(-1, Math.min(1, wave * envelope * 0.35));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }

  return buffer;
}

function writeWavHeader(buffer: Buffer, sampleRate: number, dataSize: number): void {
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
}

function frequencyForKey(key: string): number {
  const root = key.trim().split(/\s+/)[0]?.toUpperCase() ?? 'A';
  const table: Record<string, number> = {
    C: 261.63,
    'C#': 277.18,
    DB: 277.18,
    D: 293.66,
    'D#': 311.13,
    EB: 311.13,
    E: 329.63,
    F: 349.23,
    'F#': 369.99,
    GB: 369.99,
    G: 392.0,
    'G#': 415.3,
    AB: 415.3,
    A: 440.0,
    'A#': 466.16,
    BB: 466.16,
    B: 493.88,
  };
  return table[root] ?? 440.0;
}
