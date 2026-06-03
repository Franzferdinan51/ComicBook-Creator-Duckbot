import { randomUUID } from 'node:crypto';
import type { ComicOptions, StoryProject } from '../types.js';
import { normalizeRenderProfile } from './render-profile.js';
import { buildAgentGuidancePackage } from './agent-guidance.js';

function inferTitle(story: string): string {
  const firstSentence = story.split(/[.!?]/)[0]?.trim();
  if (!firstSentence) return 'Untitled Project';
  return firstSentence.length > 80
    ? `${firstSentence.slice(0, 77).trimEnd()}...`
    : firstSentence;
}

export function buildStoryProject(
  story: string,
  options: Partial<ComicOptions> = {}
): StoryProject {
  const title = inferTitle(story);
  const artStyle = options.artStyle ?? 'manga';
  const renderProfile = normalizeRenderProfile(options);
  const agentGuidancePackage = buildAgentGuidancePackage({
    title,
    premise: story,
    artStyle,
    outputProfile: renderProfile.outputProfile,
  });

  return {
    id: randomUUID(),
    title,
    premise: story,
    artStyle,
    renderProfile,
    storyBible: {
      premise: story,
      synopsis: `${title} develops into a multi-scene illustrated narrative ready for comics and later adaptation.`,
      chapterOutline: ['Opening', 'Escalation', 'Climax', 'Resolution'],
      sceneBeats: [
        'Introduce the core world and cast.',
        'Raise the central conflict.',
        'Deliver a visual turning point.',
      ],
    },
    adaptationPackage: {
      format: 'screen-outline',
      sceneOutline: [
        {
          sceneId: 'scene-1',
          summary: 'Open on the project premise and establish the primary conflict.',
          visualGoal: 'Set scale, mood, and the cinematic hook.',
        },
      ],
    },
    musicCuePackage: {
      format: 'music-brief',
      cues: [
        {
          cueId: 'cue-1',
          title: 'Main Theme',
          mood: 'hopeful tension',
          placement: 'opening',
        },
      ],
      themeSongPrompt: `Write a theme song concept for "${title}" with a ${artStyle} tone and cinematic momentum.`,
    },
    agentGuidancePackage,
  };
}
