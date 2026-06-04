import type { StoryProject } from '../types.js';

export function renderDirectorBriefMarkdown(project: StoryProject): string {
  const scenes = project.adaptationPackage.screenplayScenes;
  const sceneOutline = project.adaptationPackage.sceneOutline;
  const storyboardPrompts = project.adaptationPackage.storyboardPrompts;
  const trailerBeats = project.trailerPackage.teaserBeats;
  const cues = project.musicCuePackage.cues;
  const sceneCueMap = project.musicCuePackage.sceneCueMap;
  const episodes = project.seriesPackage.episodeOutline;

  const keyScenes = scenes.slice(0, 5).map((scene, index) => [
    `### Scene ${index + 1}: ${scene.slugline}`,
    '',
    `- Scene id: ${scene.sceneId}`,
    `- Action focus: ${scene.action}`,
    `- Signature shot: ${scene.shotList[0] ?? 'Carry the comic iconography into a clear cinematic image.'}`,
  ].join('\n')).join('\n\n');

  const visualPriorities = sceneOutline.slice(0, 5).map((scene, index) => {
    const screenplayScene = scenes.find((item) => item.sceneId === scene.sceneId);
    const storyboardPrompt = storyboardPrompts.find((item) => item.sceneId === scene.sceneId);
    const cueMap = sceneCueMap.find((item) => item.sceneId === scene.sceneId);
    return [
      `### Priority ${index + 1}: ${scene.sceneId}`,
      '',
      `- Summary: ${scene.summary}`,
      `- Visual goal: ${scene.visualGoal}`,
      `- Screen beat: ${screenplayScene?.slugline ?? 'Lock the scene into a screen-ready beat.'}`,
      `- Shot language: ${storyboardPrompt?.cameraLanguage ?? 'Dynamic cinematic framing.'}`,
      `- Score support: ${cueMap?.purpose ?? 'Use music to underline the emotional turn and pacing.'}`,
    ].join('\n');
  }).join('\n\n');

  const trailerSection = trailerBeats.map((beat, index) =>
    `- Beat ${index + 1}: ${beat.title} — ${beat.description}`
  ).join('\n');

  const episodeSection = episodes.slice(0, 4).map((episode) =>
    `- ${episode.episodeId} ${episode.title}: ${episode.summary} Ends on ${episode.cliffhanger}`
  ).join('\n');

  const musicSection = cues.slice(0, 5).map((cue) => {
    const placement = sceneCueMap.find((item) => item.cueId === cue.cueId);
    return `- ${cue.title}: ${cue.mood} mood for ${cue.placement}${placement ? ` (${placement.timing}, ${placement.purpose})` : ''}`;
  }).join('\n');

  return `# ${project.title}

## Director Brief

- Source project: ${project.title}
- Premise: ${project.premise}
- Project goal: ${project.projectGoal}
- Art style: ${project.artStyle}
- Render profile: ${project.renderProfile.outputProfile}
- Screen target: ${project.seriesPackage.targetFormat}

## Core Intent

${project.storyBible.synopsis}

## Production Read

- Audience promise: ${project.trailerPackage.logline}
- Trailer hook: ${project.trailerPackage.hook}
- Series engine: ${project.seriesPackage.seriesLogline}
- Music spine: ${project.musicCuePackage.songDraft.title} in ${project.musicCuePackage.songDraft.genre}

## Screen Strategy

- Preserve these story beats:
${project.storyBible.sceneBeats.slice(0, 5).map((beat) => `  - ${beat}`).join('\n')}
- Adaptation direction:
${project.seriesPackage.showrunnerNotes.slice(0, 5).map((note) => `  - ${note}`).join('\n')}

## Key Scenes

${keyScenes}

## Visual Priorities

${visualPriorities}

## Trailer Angle

${trailerSection}

## Series / Episode Path

${episodeSection}

## Music and Rhythm

- Theme prompt: ${project.musicCuePackage.themeSongPrompt}
- Cue plan:
${musicSection}

## Immediate Next Moves

- Lock the screenplay scenes with the strongest comic iconography first.
- Build storyboard and previs passes around the priority scenes above.
- Use the trailer beats to shape a teaser or pitch cut before full production.
- Keep the score brief aligned to scene timing so the adaptation does not feel like a slideshow.
`;
}
