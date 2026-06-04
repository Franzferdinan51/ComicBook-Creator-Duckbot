import type { Page, SeriesPackage, StoryProject, TrailerPackage } from '../types.js';

export interface StoryboardPackageInput {
  project: StoryProject;
  pages: Array<{
    page: Page;
    panelImagePaths: string[];
  }>;
  songAudioPath: string | null;
}

export interface TrailerPackageInput {
  project: Pick<StoryProject, 'title' | 'projectGoal' | 'storyBible' | 'adaptationPackage' | 'musicCuePackage'>;
}

export interface SeriesPackageInput {
  project: Pick<StoryProject, 'title' | 'projectGoal' | 'storyBible' | 'adaptationPackage'>;
}

export function buildTrailerPackage(input: TrailerPackageInput): TrailerPackage {
  const { project } = input;
  const openingScene = project.adaptationPackage.screenplayScenes[0];
  const midpointScene = project.adaptationPackage.screenplayScenes[Math.max(0, Math.floor(project.adaptationPackage.screenplayScenes.length / 2))];
  const endingScene = project.adaptationPackage.screenplayScenes[project.adaptationPackage.screenplayScenes.length - 1];
  const cueMap = project.musicCuePackage.sceneCueMap;
  const openerCue = project.musicCuePackage.cues[0];
  const endingCue = project.musicCuePackage.cues[project.musicCuePackage.cues.length - 1];

  return {
    format: 'trailer-package',
    logline: `${project.title} becomes a cinematic ${project.projectGoal} story with a visual hook built for screen and sound.`,
    hook: project.storyBible.premise,
    teaserBeats: [
      {
        beatId: 'beat-1',
        title: 'World Hook',
        description: openerCue
          ? `${openerCue.title} sets the first emotional pulse for the trailer.`
          : project.adaptationPackage.sceneOutline[0]?.visualGoal || 'Open on the world and establish the cinematic promise.',
        sourceSceneId: openingScene?.sceneId,
      },
      {
        beatId: 'beat-2',
        title: 'Pressure Builds',
        description: midpointScene?.action || 'A turning point forces the cast toward motion and escalation.',
        sourceSceneId: midpointScene?.sceneId,
      },
      {
        beatId: 'beat-3',
        title: 'Music Lands the Hook',
        description: endingCue ? `${endingCue.title} supports the final emotional hit.` : 'Music drives the final emotional landing.',
        sourceSceneId: endingScene?.sceneId,
      },
    ],
    voiceOver: [
      `From the world of ${project.title}.`,
      project.storyBible.synopsis,
      `A ${project.projectGoal} journey that moves from comic panels into a real screen-ready pitch.`,
    ],
    cutList: [
      {
        shotId: 'cut-1',
        shotType: 'wide establishing shot',
        purpose: 'Open with scale and the primary visual promise.',
        sourceSceneId: openingScene?.sceneId,
      },
      {
        shotId: 'cut-2',
        shotType: 'reaction close-up',
        purpose: 'Land the character beat that makes the pitch feel human.',
        sourceSceneId: midpointScene?.sceneId,
      },
      {
        shotId: 'cut-3',
        shotType: 'motion montage',
        purpose: 'Fuse the comic art with movement, sound, and a stronger cinematic pulse.',
        sourceSceneId: cueMap[0]?.sceneId,
      },
      {
        shotId: 'cut-4',
        shotType: 'final title card',
        purpose: 'End on the title, release, and call to continue into the full project.',
        sourceSceneId: endingScene?.sceneId,
      },
    ],
    endCard: endingCue ? `${project.title} ends on the ${endingCue.title} cue.` : `${project.title} ends on the final hook.`,
    durationSeconds: 75,
  };
}

export function buildSeriesPackage(input: SeriesPackageInput): SeriesPackage {
  const { project } = input;
  const screenplayScenes = project.adaptationPackage.screenplayScenes;
  const sceneOutline = project.adaptationPackage.sceneOutline;
  const openingScene = screenplayScenes[0];
  const midpointScene = screenplayScenes[Math.max(0, Math.floor(screenplayScenes.length / 2))];
  const endingScene = screenplayScenes[screenplayScenes.length - 1];
  const openingOutline = sceneOutline[0];
  const midpointOutline = sceneOutline[Math.max(0, Math.floor(sceneOutline.length / 2))];
  const endingOutline = sceneOutline[sceneOutline.length - 1];
  const targetFormat = project.projectGoal === 'studio'
    ? 'limited-series'
    : project.projectGoal === 'screen'
      ? 'series'
      : 'pilot';

  return {
    format: 'series-bible',
    seriesLogline: `${project.title} unfolds as a ${targetFormat.replace('-', ' ')} with a comic-born visual identity and an episode engine built for screen continuation.`,
    premise: project.storyBible.premise,
    targetFormat,
    seasonArc: [
      `Episode 1 establishes ${project.title}'s world, cast, and the emotional promise behind the premise.`,
      'The middle run widens the conflict into a repeatable weekly engine with stronger reveals and reversals.',
      'The finale lands the current arc cleanly while opening the door to a larger season or follow-up batch of episodes.',
    ],
    episodeOutline: [
      {
        episodeId: 'ep-1',
        title: 'Pilot',
        summary: openingOutline?.summary || openingScene?.action || 'Introduce the world and central hook.',
        cliffhanger: 'A final image hints that the comic-sized problem is only the opening edge of a larger series arc.',
        sourceSceneId: openingScene?.sceneId ?? openingOutline?.sceneId,
      },
      {
        episodeId: 'ep-2',
        title: 'Pressure Point',
        summary: midpointOutline?.summary || midpointScene?.action || 'The cast is pushed into motion.',
        cliffhanger: 'The stakes widen beyond the initial premise and reveal the real shape of the season.',
        sourceSceneId: midpointScene?.sceneId ?? midpointOutline?.sceneId,
      },
      {
        episodeId: 'ep-3',
        title: 'Final Hook',
        summary: endingOutline?.summary || endingScene?.action || 'The core promise lands cleanly.',
        cliffhanger: 'The ending resolves the pilot-sized plot while teeing up the next episode or a larger season-order question.',
        sourceSceneId: endingScene?.sceneId ?? endingOutline?.sceneId,
      },
    ],
    pilotBeatSheet: [
      'Open on the world, tone, and the first strong image that proves the comic can live as a show.',
      'Introduce the core cast and the repeating story engine that can sustain multiple episodes.',
      'Escalate into a midpoint choice that changes the season trajectory, not just the current scene.',
      'End with a hook that can drive episodic continuation and a broader writer-room conversation.',
    ],
    showrunnerNotes: [
      'Keep the emotional premise readable in one episode, but always point each beat toward a broader season question.',
      'Build each episode around a clear hook, a status-quo shift, and a reason to come back next week.',
      'Preserve the comic’s iconic imagery while widening pacing, geography, and ensemble dynamics for screen storytelling.',
    ],
  };
}

export function buildStoryboardPackage(input: StoryboardPackageInput) {
  const { project, pages } = input;
  const flattenedPanels = pages.flatMap((pageEntry) =>
    pageEntry.page.panels.map((panel, index) => ({
      pageNumber: pageEntry.page.pageNumber,
      panel,
      panelImagePath: pageEntry.panelImagePaths[index] ?? '',
    }))
  );
  const scenes = project.adaptationPackage.screenplayScenes;
  const storyboardPrompts = project.adaptationPackage.storyboardPrompts;

  return {
    format: 'storyboard-package',
    title: project.title,
    outputProfile: project.renderProfile.outputProfile,
    shots: scenes.map((scene, index) => {
      const panel = flattenedPanels[index % Math.max(1, flattenedPanels.length)];
      const prompt = storyboardPrompts.find((item) => item.sceneId === scene.sceneId);
      return {
        shotId: `shot-${String(index + 1).padStart(3, '0')}`,
        sceneId: scene.sceneId,
        slugline: scene.slugline,
        action: scene.action,
        dialogueSample: scene.dialogueSample,
        shotList: scene.shotList,
        storyboardPrompt: prompt?.prompt ?? '',
        cameraLanguage: prompt?.cameraLanguage ?? '',
        pageNumber: panel?.pageNumber ?? 0,
        panelId: panel?.panel.id ?? '',
        panelImagePath: panel?.panelImagePath ?? '',
        durationSeconds: 4,
      };
    }),
  };
}

export function buildAnimaticTimeline(input: StoryboardPackageInput) {
  const storyboard = buildStoryboardPackage(input);
  let cursor = 0;
  const video = storyboard.shots.map((shot) => {
    const start = cursor;
    cursor += shot.durationSeconds;
    return {
      shotId: shot.shotId,
      sceneId: shot.sceneId,
      imagePath: shot.panelImagePath,
      startSeconds: start,
      durationSeconds: shot.durationSeconds,
      caption: shot.action,
    };
  });

  return {
    format: 'animatic-timeline',
    title: storyboard.title,
    durationSeconds: cursor,
    tracks: {
      video,
      audio: input.songAudioPath
        ? [{
            audioPath: input.songAudioPath,
            startSeconds: 0,
            durationSeconds: cursor,
            purpose: 'Temporary theme bed for storyboard timing.',
          }]
        : [],
    },
  };
}
