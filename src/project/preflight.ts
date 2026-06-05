import { constants } from 'node:fs';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

import {
  allImageProviderNames,
  allMusicProviderNames,
  allTextProviderNames,
  getProviderConfig,
  isProviderConfigured,
} from '../providers/index.js';

export type PreflightStatus = 'pass' | 'warn' | 'fail';

export interface PreflightCheck {
  id: string;
  label: string;
  status: PreflightStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface PreflightReport {
  status: PreflightStatus;
  generatedAt: string;
  cwd: string;
  checks: PreflightCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
}

export async function runPreflight(): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];
  checks.push(checkNodeVersion());
  checks.push(await checkOutputDirectory());
  checks.push(await checkAgentDocs());
  checks.push(await checkPackageEntrypoints());
  checks.push(checkProviderRegistry());
  checks.push(await checkMiniMaxCli());

  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 } as PreflightReport['summary']
  );

  return {
    status: summary.fail > 0 ? 'fail' : summary.warn > 0 ? 'warn' : 'pass',
    generatedAt: new Date().toISOString(),
    cwd: process.cwd(),
    checks,
    summary,
  };
}

function checkNodeVersion(): PreflightCheck {
  const major = Number(process.versions.node.split('.')[0] ?? 0);
  if (major >= 20) {
    return {
      id: 'node-version',
      label: 'Node.js runtime',
      status: 'pass',
      message: `Node ${process.versions.node} satisfies the >=20 requirement.`,
    };
  }
  return {
    id: 'node-version',
    label: 'Node.js runtime',
    status: 'fail',
    message: `Node ${process.versions.node} is too old; install Node 20 or newer.`,
  };
}

function defaultOutputDir(): string {
  const home = process.env.HOME ?? '/tmp';
  return join(home, '.openclaw', 'workspace', 'output', 'comics');
}

async function checkOutputDirectory(): Promise<PreflightCheck> {
  const dir = defaultOutputDir();
  const probePath = join(dir, `.comic-preflight-${process.pid}-${Date.now()}.tmp`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(probePath, 'ok', 'utf8');
    await rm(probePath, { force: true });
    return {
      id: 'output-directory',
      label: 'Output directory',
      status: 'pass',
      message: `Can write generated comics to ${dir}.`,
      details: { path: dir },
    };
  } catch (err) {
    await rm(probePath, { force: true }).catch(() => {});
    return {
      id: 'output-directory',
      label: 'Output directory',
      status: 'fail',
      message: `Cannot write to ${dir}: ${(err as Error).message}`,
      details: { path: dir },
    };
  }
}

async function checkAgentDocs(): Promise<PreflightCheck> {
  const docs = [
    'docs/agents/hermes-openclaw-playbook.md',
    'docs/agents/external-agent-guide.md',
  ];
  const missing: string[] = [];
  for (const doc of docs) {
    try {
      await access(resolve(process.cwd(), doc), constants.R_OK);
    } catch {
      missing.push(doc);
    }
  }
  if (missing.length === 0) {
    return {
      id: 'agent-docs',
      label: 'Agent guidance files',
      status: 'pass',
      message: 'Hermes/OpenClaw playbook and external-agent guide are present.',
    };
  }
  return {
    id: 'agent-docs',
    label: 'Agent guidance files',
    status: 'fail',
    message: `Missing required agent docs: ${missing.join(', ')}`,
    details: { missing },
  };
}

async function checkPackageEntrypoints(): Promise<PreflightCheck> {
  try {
    const pkg = JSON.parse(await readFile(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
      bin?: Record<string, string>;
    };
    const missing: string[] = [];
    for (const script of ['start', 'test', 'test:server', 'test:mcp']) {
      if (!pkg.scripts?.[script]) missing.push(`script:${script}`);
    }
    for (const binName of ['comic-creator', 'comic-creator-mcp']) {
      if (!pkg.bin?.[binName]) missing.push(`bin:${binName}`);
    }
    if (missing.length === 0) {
      return {
        id: 'package-entrypoints',
        label: 'Package entrypoints',
        status: 'pass',
        message: 'CLI, MCP, server, and test entrypoints are declared.',
      };
    }
    return {
      id: 'package-entrypoints',
      label: 'Package entrypoints',
      status: 'fail',
      message: `Missing package entrypoints: ${missing.join(', ')}`,
      details: { missing },
    };
  } catch (err) {
    return {
      id: 'package-entrypoints',
      label: 'Package entrypoints',
      status: 'fail',
      message: `Cannot read package.json: ${(err as Error).message}`,
    };
  }
}

function providerStatus(names: string[]) {
  return names.map((name) => {
    const cfg = getProviderConfig(name);
    return {
      name,
      available: isProviderConfigured(name),
      model: cfg.model ?? null,
      baseUrl: cfg.baseUrl ?? null,
      apiStyle: cfg.apiStyle ?? null,
      isLocal: Boolean(cfg.isLocal),
      hasApiKey: Boolean(cfg.apiKey),
    };
  });
}

function checkProviderRegistry(): PreflightCheck {
  const text = providerStatus(allTextProviderNames());
  const image = providerStatus(allImageProviderNames());
  const music = providerStatus(allMusicProviderNames());
  const realText = text.filter((provider) => provider.name !== 'mock' && provider.available);
  const realImage = image.filter((provider) => provider.name !== 'mock' && provider.available);
  const realMusic = music.filter((provider) => provider.name !== 'mock' && provider.available);
  const hasMockFallbacks =
    text.some((provider) => provider.name === 'mock' && provider.available) &&
    image.some((provider) => provider.name === 'mock' && provider.available) &&
    music.some((provider) => provider.name === 'mock' && provider.available);

  if (!hasMockFallbacks) {
    return {
      id: 'provider-registry',
      label: 'Provider registry',
      status: 'fail',
      message: 'Mock text/image/music fallbacks are not all registered.',
      details: { text, image, music },
    };
  }

  const warnings: string[] = [];
  if (realText.length === 0) warnings.push('no configured real text provider');
  if (realImage.length === 0) warnings.push('no configured real image provider');
  if (realMusic.length === 0) warnings.push('no configured real music provider');
  return {
    id: 'provider-registry',
    label: 'Provider registry',
    status: warnings.length > 0 ? 'warn' : 'pass',
    message: warnings.length > 0
      ? `Mock mode is ready, but production media is limited: ${warnings.join('; ')}.`
      : 'At least one real text, image, and music provider is configured.',
    details: { text, image, music },
  };
}

async function checkMiniMaxCli(): Promise<PreflightCheck> {
  const binary = process.env.MINIMAX_MUSIC_BINARY?.trim() || 'mmx';
  const minimaxConfigured = isProviderConfigured('minimax');
  const result = await runVersionProbe(binary, ['--version'], 3000);
  if (result.ok) {
    return {
      id: 'minimax-cli',
      label: 'MiniMax CLI',
      status: 'pass',
      message: `${binary} is available for music/video production handoffs.`,
      details: { binary, version: result.output },
    };
  }
  return {
    id: 'minimax-cli',
    label: 'MiniMax CLI',
    status: minimaxConfigured ? 'fail' : 'warn',
    message: minimaxConfigured
      ? `MiniMax is configured but ${binary} is not runnable: ${result.output}`
      : `${binary} is not runnable; MiniMax music/video generation will need the CLI installed before real production runs.`,
    details: { binary, error: result.output },
  };
}

async function runVersionProbe(binary: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  return await new Promise((resolveProbe) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolveProbe({ ok: false, output: `timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      output += chunk;
    });
    child.once('error', (err) => {
      clearTimeout(timer);
      resolveProbe({ ok: false, output: err.message });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolveProbe({
        ok: code === 0,
        output: output.trim().slice(0, 500) || `exited with code ${code ?? 1}`,
      });
    });
  });
}
