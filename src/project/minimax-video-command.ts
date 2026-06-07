import type { VideoPackage } from '../types.js';

export type VideoClip = VideoPackage['clips'][number];

export function buildMiniMaxVideoGenerateArgs(clip: Pick<VideoClip, 'prompt' | 'referenceImagePath' | 'subjectImagePath'>): string[] {
  return [
    'video',
    'generate',
    '--prompt',
    clip.prompt,
    ...(clip.referenceImagePath ? ['--first-frame', clip.referenceImagePath] : []),
    ...(clip.subjectImagePath ? ['--subject-image', clip.subjectImagePath] : []),
    '--async',
  ];
}

export function buildMiniMaxVideoGenerateCommand(clip: Pick<VideoClip, 'prompt' | 'referenceImagePath' | 'subjectImagePath'>): string {
  return ['mmx', ...buildMiniMaxVideoGenerateArgs(clip)]
    .map((part) => quoteShellArg(part))
    .join(' ');
}

function quoteShellArg(value: string): string {
  return /^[a-zA-Z0-9._/:=-]+$/.test(value) ? value : JSON.stringify(value);
}
