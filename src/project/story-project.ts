import { randomUUID } from 'node:crypto';
import type { ComicOptions, ProjectGoal, StoryProject } from '../types.js';
import { normalizeRenderProfile } from './render-profile.js';
import { buildAgentGuidancePackage } from './agent-guidance.js';
import { buildSeriesPackage, buildTrailerPackage, buildVideoPackage } from './video-assets.js';

const PROJECT_GOAL_LABELS: Record<ProjectGoal, string> = {
  comic: 'comic-first production',
  screen: 'screen/show handoff',
  music: 'music-first soundtrack pass',
  studio: 'balanced studio workflow',
};

function goalSummary(goal: ProjectGoal): string {
  switch (goal) {
    case 'screen':
      return 'The structure emphasizes shot-ready scenes, motion-friendly transitions, and storyboard clarity.';
    case 'music':
      return 'The structure emphasizes cueable moments, lyrical motifs, and soundtrack-ready pacing.';
    case 'studio':
      return 'The structure balances comic readability, screen adaptation assets, and music handoff artifacts.';
    case 'comic':
    default:
      return 'The structure prioritizes readable comic pages and a clean narrative arc.';
  }
}

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
  const projectGoal = options.projectGoal ?? 'comic';
  const renderProfile = normalizeRenderProfile({
    ...options,
    outputProfile: options.outputProfile ?? (projectGoal === 'screen' ? 'storyboard-widescreen' : 'comic-print'),
  });

  const storyBible = {
    premise: story,
    synopsis: `${title} develops into a multi-scene illustrated narrative ready for comics and later adaptation. ${goalSummary(projectGoal)}`,
    chapterOutline: ['Opening', 'Escalation', 'Climax', 'Resolution'],
    sceneBeats: [
      'Introduce the core world and cast.',
      'Raise the central conflict.',
      'Deliver a visual turning point.',
    ],
  };

  const adaptationPackage = {
    format: 'screen-outline' as const,
    sceneOutline: [
      {
        sceneId: 'scene-1',
        summary: 'Open on the project premise and establish the primary conflict.',
        visualGoal: 'Set scale, mood, and the cinematic hook.',
      },
      {
        sceneId: 'scene-2',
        summary: 'Escalate the conflict through a visual discovery and a character choice.',
        visualGoal: 'Turn comic panel energy into a screen sequence with motion and tension.',
      },
      {
        sceneId: 'scene-3',
        summary: 'Resolve the central moment while leaving a hook for the next episode or issue.',
        visualGoal: 'Land the emotional image that can become the final storyboard frame.',
      },
    ],
    screenplayScenes: [
      {
        sceneId: 'scene-1',
        slugline: 'INT./EXT. OPENING WORLD - DAY',
        action: `${title} opens on the world implied by the premise: ${story}`,
        dialogueSample: [
          'LEAD: This is where everything changes.',
          'ALLY: Then we make sure the world sees it.',
        ],
        shotList: ['wide establishing shot', 'character reveal', 'insert on the visual hook'],
      },
      {
        sceneId: 'scene-2',
        slugline: 'INT./EXT. CONFLICT SPACE - CONTINUOUS',
        action: 'The central cast faces a discovery that forces the story from setup into motion.',
        dialogueSample: [
          'LEAD: We are out of time.',
          'RIVAL: Time is exactly what I came to take.',
        ],
        shotList: ['tracking shot into the conflict', 'reaction close-up', 'dynamic action beat'],
      },
      {
        sceneId: 'scene-3',
        slugline: 'INT./EXT. RESOLUTION IMAGE - NIGHT',
        action: 'The visual promise of the comic becomes the final screen image and musical landing point.',
        dialogueSample: [
          'ALLY: So what happens now?',
          'LEAD: Now we become the story.',
        ],
        shotList: ['slow push-in', 'hero silhouette', 'final hook frame'],
      },
    ],
    storyboardPrompts: [
      {
        sceneId: 'scene-1',
        prompt: `${artStyle} cinematic storyboard frame for "${title}", opening world, strong silhouette, clear story hook, optimized for ${PROJECT_GOAL_LABELS[projectGoal]}.`,
        cameraLanguage: projectGoal === 'screen'
          ? 'wide establishing frame with readable foreground, midground, and background.'
          : 'wide establishing frame with readable foreground, midground, and background.',
      },
      {
        sceneId: 'scene-2',
        prompt: `${artStyle} storyboard action frame for "${title}", escalating conflict, expressive character staging, optimized for ${PROJECT_GOAL_LABELS[projectGoal]}.`,
        cameraLanguage: 'moving camera energy, diagonal composition, high contrast focal point.',
      },
      {
        sceneId: 'scene-3',
        prompt: `${artStyle} final storyboard frame for "${title}", emotional resolution with sequel hook, optimized for ${PROJECT_GOAL_LABELS[projectGoal]}.`,
        cameraLanguage: 'slow push-in feeling, centered hero image, clean negative space for title or lyrics.',
      },
    ],
  };

  const musicCuePackage = {
    format: 'music-brief' as const,
    cues: [
      {
        cueId: 'cue-1',
        title: 'Main Theme',
        mood: 'hopeful tension',
        placement: 'opening',
        sceneId: 'scene-1',
        instrumentation: ['hybrid strings', 'warm synth pulse', 'cinematic percussion'],
      },
      {
        cueId: 'cue-2',
        title: 'Conflict Pulse',
        mood: 'urgent motion',
        placement: 'midpoint escalation',
        sceneId: 'scene-2',
        instrumentation: ['taiko hits', 'distorted bass', 'staccato strings'],
      },
      {
        cueId: 'cue-3',
        title: 'Final Hook',
        mood: 'triumphant wonder',
        placement: 'ending',
        sceneId: 'scene-3',
        instrumentation: ['choir pad', 'lead motif', 'wide cinematic drums'],
      },
    ],
    sceneCueMap: [
      {
        sceneId: 'scene-1',
        cueId: 'cue-1',
        timing: '00:00-00:45',
        purpose: 'Introduce the theme and emotional promise of the world.',
      },
      {
        sceneId: 'scene-2',
        cueId: 'cue-2',
        timing: '00:45-01:30',
        purpose: 'Drive the conflict forward and support faster visual pacing.',
      },
      {
        sceneId: 'scene-3',
        cueId: 'cue-3',
        timing: '01:30-02:15',
        purpose: 'Resolve the scene while setting up a trailer-ready final image.',
      },
    ],
    songDraft: {
      title: `${title} Theme`,
      genre: 'cinematic pop',
      bpm: 96,
      key: 'A minor',
      sections: ['verse', 'pre-chorus', 'chorus', 'bridge'],
      lyrics: [
        `[Verse]`,
        `${title} rises where the shadows start to glow`,
        `Every frame is moving where the brave ones have to go`,
        `[Chorus]`,
        `Turn the page, light the screen, let the whole world know`,
        `${title} carries the fire into the show`,
      ].join('\n'),
    },
    themeSongPrompt: `Write a theme song concept for "${title}" with a ${artStyle} tone and cinematic momentum.`,
    musicGenerationPrompt: `Generate a cinematic pop theme for "${title}" with instrumentation based on hybrid strings, synth pulse, cinematic percussion, and a lead motif. Use the scene cue map to shape dynamics from opening tension to final hook, and bias the arrangement toward the ${PROJECT_GOAL_LABELS[projectGoal]}.`,
  };

  const agentGuidancePackage = buildAgentGuidancePackage({
    title,
    premise: story,
    artStyle,
    outputProfile: renderProfile.outputProfile,
    projectGoal,
  });

  const trailerPackage = buildTrailerPackage({
    project: {
      title,
      projectGoal,
      storyBible,
      adaptationPackage,
      musicCuePackage,
    },
  });

  const seriesPackage = buildSeriesPackage({
    project: {
      title,
      projectGoal,
      storyBible,
      adaptationPackage,
    },
  });

  const videoPackage = buildVideoPackage({
    project: {
      title,
      artStyle,
      projectGoal,
      renderProfile,
      adaptationPackage,
      trailerPackage,
      musicCuePackage,
    },
    pages: [],
    songAudioPath: null,
  });

  return {
    id: randomUUID(),
    title,
    premise: story,
    artStyle,
    projectGoal,
    renderProfile,
    storyBible,
    adaptationPackage,
    seriesPackage,
    trailerPackage,
    videoPackage,
    musicCuePackage,
    agentGuidancePackage,
  };
}
