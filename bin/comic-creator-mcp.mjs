#!/usr/bin/env node
/**
 * comic-creator-mcp — MCP server entrypoint.
 *
 * Spawned by an MCP host (OpenClaw gateway, Hermes, Claude Desktop, etc.).
 * Speaks JSON-RPC over stdin/stdout.
 *
 * Always runs the source entrypoint in this checkout so the MCP server
 * matches the current working tree without requiring a separate build step.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(here, '..');

const sourceEntry = join(skillRoot, 'src', 'mcp', 'server.ts');

// Use npx tsx so we don't require a global tsx install.
const tsxBin = join(skillRoot, 'node_modules', '.bin', 'tsx');
const tsxCmd = existsSync(tsxBin) ? tsxBin : 'npx';
const tsxArgs = existsSync(tsxBin) ? [sourceEntry] : ['--yes', 'tsx', sourceEntry];
const child = spawn(tsxCmd, tsxArgs, {
  stdio: 'inherit',
  env: process.env,
  cwd: skillRoot,
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[comic-creator-mcp] failed to start:', err);
  process.exit(1);
});
