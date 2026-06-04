import type { StoryProject } from '../types.js';

export function renderScreenplayMarkdown(project: StoryProject): string {
  const scenes = project.adaptationPackage.screenplayScenes;
  const titlePage = [
    `# ${project.title}`,
    '',
    '## Screenplay Handoff',
    '',
    `- Source project: ${project.title}`,
    `- Premise: ${project.premise}`,
    `- Project goal: ${project.projectGoal}`,
    `- Art style: ${project.artStyle}`,
    `- Render profile: ${project.renderProfile.outputProfile}`,
  ].join('\n');

  const body = scenes.map((scene, index) => {
    const sceneOutline = project.adaptationPackage.sceneOutline.find((item) => item.sceneId === scene.sceneId);
    return [
      '',
      `## Scene ${index + 1}: ${scene.slugline}`,
      '',
      `- Scene id: ${scene.sceneId}`,
      `- Visual goal: ${sceneOutline?.visualGoal || 'Carry the comic energy into a screen-ready scene.'}`,
      '',
      '### Action',
      '',
      scene.action,
      '',
      '### Dialogue Sample',
      '',
      ...scene.dialogueSample.map((line) => `- ${line}`),
      '',
      '### Shot List',
      '',
      ...scene.shotList.map((shot) => `- ${shot}`),
    ].join('\n');
  }).join('\n');

  return `${titlePage}

## Story Spine

${project.storyBible.synopsis}

## Screenplay Scenes
${body}

## Episodic Follow-Through

- Series format target: ${project.seriesPackage.targetFormat}
- Episode seeds: ${project.seriesPackage.episodeOutline.map((episode) => `${episode.episodeId} ${episode.title}`).join(', ')}
- Showrunner notes:
${project.seriesPackage.showrunnerNotes.map((note) => `  - ${note}`).join('\n')}
`;
}
