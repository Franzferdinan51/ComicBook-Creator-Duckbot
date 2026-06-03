import type { AgentGuidancePackage, ProjectGoal, StoryProject } from '../types.js';

const PROJECT_GOAL_LABELS: Record<ProjectGoal, string> = {
  comic: 'comic-first production',
  screen: 'screen/show handoff',
  music: 'music-first soundtrack pass',
  studio: 'balanced studio workflow',
};

export function buildAgentGuidancePackage(params: {
  title: string;
  premise: string;
  artStyle: string;
  outputProfile: string;
  projectGoal: ProjectGoal;
}): AgentGuidancePackage {
  const { title, premise, artStyle, outputProfile, projectGoal } = params;
  const goalLabel = PROJECT_GOAL_LABELS[projectGoal];

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
      `Use Hermes Agent to break "${title}" into reusable story, screen adaptation, and soundtrack tasks with a ${goalLabel} focus.`,
      `Use OpenClaw-connected tools to generate comic pages with the ${outputProfile} render profile and preserve reusable artifacts.`,
      'Promote approved story beats into screenplay scenes, storyboard prompts, cue maps, song drafts, and future external production tasks.',
      'Treat the project artifact as the source of truth and feed changes back into CLI, MCP, and external-agent workflows.',
      `Use the generated storyboard package, animatic timeline, song sheet, and theme audio as production handoff assets for ${goalLabel} follow-through.`,
    ],
    deliverables: [
      'comic pages and export package',
      'screen adaptation outline with screenplay scenes and storyboard prompts',
      'music cue brief with scene mapping, song draft, and generation prompt',
      'agent handoff guidance for external production runs',
      `show/movie handoff package with storyboard and animatic artifacts tuned for ${goalLabel}`,
    ],
    operatorChecklist: [
      'Keep character names, tone, and world details consistent across comic, screen, and music outputs.',
      'Prefer deterministic mock validation before using paid providers for large generation runs.',
      'Preserve aspect-ratio and output-profile intent through panel rendering, cover art, and final export.',
      'Treat the project artifact as the source of truth for future CLI, MCP, and external-agent workflows.',
      `Bias the next production pass toward the ${goalLabel} while keeping the other handoff artifacts in sync.`,
    ],
    externalInterfaces: ['cli', 'mcp', 'webui', 'external-agent'],
    systemPrompt: `You are the studio orchestration agent for "${title}". Work from the premise "${premise}" in a ${artStyle} style. Primary goal: ${goalLabel}. Use Hermes Agent for planning and decomposition, use OpenClaw for connected execution, and always preserve continuity between comic pages, screen adaptation scenes, soundtrack concepts, and show/movie handoff artifacts.`,
  };
}

export function renderAgentGuidanceMarkdown(project: StoryProject): string {
  const guidance = project.agentGuidancePackage;
  return `# ${project.title} Agent Guidance

## Project

- Title: ${project.title}
- Premise: ${project.premise}
- Art style: ${project.artStyle}
- Project goal: ${project.projectGoal}
- Output profile: ${project.renderProfile.outputProfile}

## Framework Base

- Hermes Agent: ${guidance.frameworks.hermesAgent.repository}
  Role: ${guidance.frameworks.hermesAgent.role}
- OpenClaw: ${guidance.frameworks.openClaw.repository}
  Role: ${guidance.frameworks.openClaw.role}

## Repo Playbook

- Hermes + OpenClaw playbook: ./docs/agents/hermes-openclaw-playbook.md
- External agent guide: ./docs/agents/external-agent-guide.md

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

## Show / Movie Handoff

- Storyboard package path: generated alongside the comic output
- Animatic timeline path: generated alongside the comic output
- Studio bundle path: generated alongside the comic output
- Adaptation package: screenplay scenes + storyboard prompts
- Use the studio bundle to hand off the full project state to external agents
- Use the song sheet and theme audio together when refining the soundtrack pass
- External agent follow-up: use the handoff file to continue into production planning

## Operator Checklist

${guidance.operatorChecklist.map((item) => `- ${item}`).join('\n')}

## Interfaces

${guidance.externalInterfaces.map((item) => `- ${item}`).join('\n')}

## Suggested System Prompt

${guidance.systemPrompt}
`;
}
