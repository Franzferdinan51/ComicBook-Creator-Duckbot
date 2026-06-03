import type { AgentGuidancePackage, StoryProject } from '../types.js';

export function buildAgentGuidancePackage(params: {
  title: string;
  premise: string;
  artStyle: string;
  outputProfile: string;
}): AgentGuidancePackage {
  const { title, premise, artStyle, outputProfile } = params;

  return {
    format: 'agent-guidance',
    frameworks: {
      hermesAgent: {
        repository: 'https://github.com/nousresearch/hermes-agent',
        role: 'Long-horizon creative planning, task routing, and multi-step operator orchestration.',
      },
      openClaw: {
        repository: 'https://github.com/openclaw/openclaw',
        role: 'Tool-connected execution layer for generation, external model access, and local workflow control.',
      },
    },
    workflowSteps: [
      `Use Hermes Agent to break "${title}" into reusable story, screen adaptation, and soundtrack tasks.`,
      `Use OpenClaw-connected tools to generate comic pages with the ${outputProfile} render profile and preserve reusable artifacts.`,
      'Promote approved story beats into screenplay scenes, storyboard prompts, cue maps, song drafts, and future external production tasks.',
    ],
    deliverables: [
      'comic pages and export package',
      'screen adaptation outline with screenplay scenes and storyboard prompts',
      'music cue brief with scene mapping, song draft, and generation prompt',
      'agent handoff guidance for external production runs',
    ],
    operatorChecklist: [
      'Keep character names, tone, and world details consistent across comic, screen, and music outputs.',
      'Prefer deterministic mock validation before using paid providers for large generation runs.',
      'Preserve aspect-ratio and output-profile intent through panel rendering, cover art, and final export.',
      'Treat the project artifact as the source of truth for future CLI, MCP, and external-agent workflows.',
    ],
    externalInterfaces: ['cli', 'mcp', 'webui', 'external-agent'],
    systemPrompt: `You are the studio orchestration agent for "${title}". Work from the premise "${premise}" in a ${artStyle} style. Use Hermes Agent for planning and decomposition, use OpenClaw for connected execution, and always preserve continuity between comic pages, screen adaptation scenes, and soundtrack concepts.`,
  };
}

export function renderAgentGuidanceMarkdown(project: StoryProject): string {
  const guidance = project.agentGuidancePackage;
  return `# ${project.title} Agent Guidance

## Project

- Title: ${project.title}
- Premise: ${project.premise}
- Art style: ${project.artStyle}
- Output profile: ${project.renderProfile.outputProfile}

## Framework Base

- Hermes Agent: ${guidance.frameworks.hermesAgent.repository}
  Role: ${guidance.frameworks.hermesAgent.role}
- OpenClaw: ${guidance.frameworks.openClaw.repository}
  Role: ${guidance.frameworks.openClaw.role}

## Workflow

${guidance.workflowSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

## Deliverables

${guidance.deliverables.map((item) => `- ${item}`).join('\n')}

## Screen Adaptation Assets

${project.adaptationPackage.screenplayScenes.map((scene) => [
  `### ${scene.sceneId}: ${scene.slugline}`,
  scene.action,
  `Dialogue sample: ${scene.dialogueSample.join(' / ')}`,
  `Shots: ${scene.shotList.join(', ')}`,
].join('\n')).join('\n\n')}

## Music And Song Assets

- Song title: ${project.musicCuePackage.songDraft.title}
- Genre: ${project.musicCuePackage.songDraft.genre}
- BPM: ${project.musicCuePackage.songDraft.bpm}
- Key: ${project.musicCuePackage.songDraft.key}
- Sections: ${project.musicCuePackage.songDraft.sections.join(', ')}

${project.musicCuePackage.songDraft.lyrics}

## Operator Checklist

${guidance.operatorChecklist.map((item) => `- ${item}`).join('\n')}

## Interfaces

${guidance.externalInterfaces.map((item) => `- ${item}`).join('\n')}

## Suggested System Prompt

${guidance.systemPrompt}
`;
}
