import type { ComicResult } from '../types.js';

export interface StudioBundle {
  format: 'studio-bundle';
  jobId: string;
  title: string;
  project: ComicResult['project'];
  script: ComicResult['script'];
  storyBible: ComicResult['storyBible'];
  adaptationPackage: ComicResult['adaptationPackage'];
  trailerPackage: ComicResult['trailerPackage'];
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
    agentPlaybookPath: string | null;
    songSheetPath: string | null;
    songAudioPath: string | null;
    storyboardPackagePath: string | null;
    trailerPackagePath: string | null;
    animaticTimelinePath: string | null;
    studioBundlePath: string | null;
  };
  availability: {
    pdf: boolean;
    cbz: boolean;
    coverImage: boolean;
    project: boolean;
    agentGuidance: boolean;
    agentPlaybook: boolean;
    songSheet: boolean;
    songAudio: boolean;
    storyboardPackage: boolean;
    trailerPackage: boolean;
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
    trailerPackage: result.trailerPackage,
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
      agentPlaybookPath: result.agentPlaybookPath,
      songSheetPath: result.songSheetPath,
      songAudioPath: result.songAudioPath,
      storyboardPackagePath: result.storyboardPackagePath,
      trailerPackagePath: result.trailerPackagePath,
      animaticTimelinePath: result.animaticTimelinePath,
      studioBundlePath: result.studioBundlePath,
    },
    availability: {
      pdf: Boolean(result.pdfPath),
      cbz: Boolean(result.cbzPath),
      coverImage: Boolean(result.coverImagePath),
      project: Boolean(result.projectPath),
      agentGuidance: Boolean(result.agentGuidancePath),
      agentPlaybook: Boolean(result.agentPlaybookPath),
      songSheet: Boolean(result.songSheetPath),
      songAudio: Boolean(result.songAudioPath),
      storyboardPackage: Boolean(result.storyboardPackagePath),
      trailerPackage: Boolean(result.trailerPackagePath),
      animaticTimeline: Boolean(result.animaticTimelinePath),
      studioBundle: Boolean(result.studioBundlePath),
    },
  };
}
