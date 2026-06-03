import { join } from 'node:path';
import type { ComicResult } from '../types.js';

export interface StudioBundle {
  format: 'studio-bundle';
  jobId: string;
  title: string;
  project: ComicResult['project'];
  script: ComicResult['script'];
  storyBible: ComicResult['storyBible'];
  adaptationPackage: ComicResult['adaptationPackage'];
  musicCuePackage: ComicResult['musicCuePackage'];
  agentGuidancePackage: ComicResult['agentGuidancePackage'];
  musicProvider: string;
  artifactPaths: {
    outputPath: string;
    pdfPath: string | null;
    cbzPath: string | null;
    coverImagePath: string | null;
    projectPath: string | null;
    agentGuidancePath: string | null;
    songSheetPath: string | null;
    songAudioPath: string | null;
    storyboardPackagePath: string | null;
    animaticTimelinePath: string | null;
    studioBundlePath: string | null;
    agentPlaybookPath: string;
  };
  availability: {
    pdf: boolean;
    cbz: boolean;
    coverImage: boolean;
    project: boolean;
    agentGuidance: boolean;
    songSheet: boolean;
    songAudio: boolean;
    storyboardPackage: boolean;
    animaticTimeline: boolean;
    studioBundle: boolean;
  };
}

export function buildStudioBundle(jobId: string, result: ComicResult): StudioBundle {
  return {
    format: 'studio-bundle',
    jobId,
    title: result.script.title,
    project: result.project,
    script: result.script,
    storyBible: result.storyBible,
    adaptationPackage: result.adaptationPackage,
    musicCuePackage: result.musicCuePackage,
    agentGuidancePackage: result.agentGuidancePackage,
    musicProvider: result.musicProvider,
    artifactPaths: {
      outputPath: result.outputPath,
      pdfPath: result.pdfPath,
      cbzPath: result.cbzPath,
      coverImagePath: result.coverImagePath,
      projectPath: result.projectPath,
      agentGuidancePath: result.agentGuidancePath,
      songSheetPath: result.songSheetPath,
      songAudioPath: result.songAudioPath,
      storyboardPackagePath: result.storyboardPackagePath,
      animaticTimelinePath: result.animaticTimelinePath,
      studioBundlePath: result.studioBundlePath,
      agentPlaybookPath: join(process.cwd(), 'docs', 'agents', 'hermes-openclaw-playbook.md'),
    },
    availability: {
      pdf: Boolean(result.pdfPath),
      cbz: Boolean(result.cbzPath),
      coverImage: Boolean(result.coverImagePath),
      project: Boolean(result.projectPath),
      agentGuidance: Boolean(result.agentGuidancePath),
      songSheet: Boolean(result.songSheetPath),
      songAudio: Boolean(result.songAudioPath),
      storyboardPackage: Boolean(result.storyboardPackagePath),
      animaticTimeline: Boolean(result.animaticTimelinePath),
      studioBundle: Boolean(result.studioBundlePath),
    },
  };
}
