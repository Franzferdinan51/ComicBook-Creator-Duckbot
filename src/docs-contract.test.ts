import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
  scripts?: Record<string, string>;
};
const readme = await readFile('README.md', 'utf8');
const debugHtml = await readFile('webui/__test__.html', 'utf8');
const mcpServer = await readFile('src/mcp/server.ts', 'utf8');

assert.equal(pkg.scripts?.start, 'tsx src/server/index.ts');
assert.equal(readme.includes('| `projectPath` |'), true);
assert.equal(readme.includes('| `storyboardPackagePath` |'), true);
assert.equal(readme.includes('| `animaticTimelinePath` |'), true);
assert.equal(readme.includes('| `songSheetPath` |'), true);
assert.equal(readme.includes('| `songAudioPath` |'), true);
assert.equal(readme.includes('Markdown handoff'), true);
assert.equal(debugHtml.includes('Array.isArray(b.music)'), true);

const toolNames = [...mcpServer.matchAll(/server\.tool\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
const toolsLine = readme.split('\n').find((line) => line.startsWith('Tools: ')) ?? '';
for (const toolName of toolNames) {
  assert.equal(
    toolsLine.includes(`\`${toolName}\``),
    true,
    `README MCP tool list is missing ${toolName}`
  );
}

console.log('PASS docs contract');
