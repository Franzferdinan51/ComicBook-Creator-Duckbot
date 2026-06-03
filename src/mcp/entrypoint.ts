import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isDirectEntrypoint(importMetaUrl: string, argvPath: string | undefined): boolean {
  if (!argvPath) return false;
  return fileURLToPath(importMetaUrl) === resolve(argvPath);
}
