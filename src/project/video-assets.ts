import type { Page, StoryProject } from '../types.js';

export interface StoryboardPackageInput {
  project: StoryProject;
  pages: Array<{
    page: Page;
    panelImagePaths: string[];
  }>;
  songAudioPath: string | null;
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
