import type { StoryProject } from '../types.js';
import { generateMockThemeWav } from '../project/index.js';

export interface MusicGenerateOptions {
  seed?: number;
  durationSeconds?: number;
}

export interface MusicProvider {
  name: string;
  generate(project: StoryProject, options?: MusicGenerateOptions): Promise<Buffer>;
}

export class MockMusic implements MusicProvider {
  name = 'mock';

  async generate(project: StoryProject, _options: MusicGenerateOptions = {}): Promise<Buffer> {
    return generateMockThemeWav(project);
  }
}
