import assert from 'node:assert/strict';
import { runPreflight } from './preflight.js';

const report = await runPreflight();

assert.equal(['pass', 'warn', 'fail'].includes(report.status), true);
assert.equal(typeof report.generatedAt, 'string');
assert.equal(typeof report.cwd, 'string');
assert.equal(report.checks.length >= 6, true);
assert.equal(report.summary.pass + report.summary.warn + report.summary.fail, report.checks.length);
assert.equal(report.checks.some((check) => check.id === 'node-version'), true);
assert.equal(report.checks.some((check) => check.id === 'output-directory'), true);
assert.equal(report.checks.some((check) => check.id === 'agent-docs'), true);
assert.equal(report.checks.some((check) => check.id === 'provider-registry'), true);
assert.equal(report.checks.some((check) => check.id === 'minimax-cli'), true);

const providerCheck = report.checks.find((check) => check.id === 'provider-registry');
assert.ok(providerCheck);
assert.equal(providerCheck.status === 'pass' || providerCheck.status === 'warn', true);

console.log('PASS preflight');
