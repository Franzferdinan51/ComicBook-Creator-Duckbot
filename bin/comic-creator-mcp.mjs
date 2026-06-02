#!/usr/bin/env node
/**
 * comic-creator-mcp — MCP server entrypoint.
 *
 * Spawned by an MCP host (OpenClaw gateway, Hermes, Claude Desktop, etc.).
 * Speaks JSON-RPC over stdin/stdout.
 *
 * Compiled entry lives at `dist/mcp/server.js` (when built with `tsc`),
 * but we prefer `tsx` for source-direct execution so a fresh `npm install`
 * works without a build step.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(here, '..');

// Prefer compiled output (faster startup, no tsx). Fall back to tsx for
// dev/source-direct use.
const compiledEntry = join(skillRoot, 'dist', 'mcp', 'server.js');
const sourceEntry = join(skillRoot, 'src', 'mcp', 'server.ts');

let child;
if (existsSync(compiledEntry)) {
  child = spawn(process.execPath, [compiledEntry], {
    stdio: 'inherit',
    env: process.env,
  });
} else {
  // Use npx tsx so we don't require a global tsx install.
  const tsxBin = join(skillRoot, 'node_modules', '.bin', 'tsx');
  const tsxCmd = existsSync(tsxBin) ? tsxBin : 'npx';
  const tsxArgs = existsSync(tsxBin) ? [sourceEntry] : ['--yes', 'tsx', sourceEntry];
  child = spawn(tsxCmd, tsxArgs, {
    stdio: 'inherit',
    env: process.env,
    cwd: skillRoot,
  });
}

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[comic-creator-mcp] failed to start:', err);
  process.exit(1);
});
