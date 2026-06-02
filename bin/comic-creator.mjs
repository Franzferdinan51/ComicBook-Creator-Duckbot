#!/usr/bin/env node
/**
 * comic-creator — CLI entrypoint.
 *
 * Spawned by `npx comic-creator` or the `comic-creator` symlink from `npm link`.
 * Delegates to `src/cli.ts` (the actual CLI implementation in TypeScript).
 *
 * Prefers the compiled `dist/cli.js` if present; otherwise falls back to tsx.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(here, '..');

const compiledEntry = join(skillRoot, 'dist', 'cli.js');
const sourceEntry = join(skillRoot, 'src', 'cli.ts');

let child;
if (existsSync(compiledEntry)) {
  child = spawn(process.execPath, [compiledEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
} else {
  const tsxBin = join(skillRoot, 'node_modules', '.bin', 'tsx');
  const tsxCmd = existsSync(tsxBin) ? tsxBin : 'npx';
  const tsxArgs = existsSync(tsxBin)
    ? [sourceEntry, ...process.argv.slice(2)]
    : ['--yes', 'tsx', sourceEntry, ...process.argv.slice(2)];
  child = spawn(tsxCmd, tsxArgs, {
    stdio: 'inherit',
    env: process.env,
    cwd: skillRoot,
  });
}

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[comic-creator] failed to start:', err);
  process.exit(1);
});
