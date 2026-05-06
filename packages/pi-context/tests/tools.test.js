import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeMemoryFile } from '@pi-context/pi-memory-core';
import { registerMemoryCheck, registerMemoryList, registerMemorySearch } from '../src/tools/index.ts';

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function createMockPi(execHandler) {
  const tools = new Map();
  return {
    tools,
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    async exec(command, args, options) {
      if (!execHandler) return { stdout: '' };
      return execHandler(command, args, options);
    },
  };
}

function createToolContext(cwd) {
  return { cwd };
}

async function executeTool(pi, name, params, cwd) {
  const tool = pi.tools.get(name);
  assert.ok(tool, `Tool not registered: ${name}`);
  return tool.execute('tool-call-1', params, undefined, undefined, createToolContext(cwd));
}

test('memory_list returns relative project files and supports directory filtering', async () => {
  const tempDir = createTempDir('pi-context-tools-list');
  const projectDir = path.join(tempDir, 'project');
  const settings = { localPath: path.join(tempDir, 'memory-root') };
  const memoryDir = path.join(settings.localPath, path.basename(projectDir));

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  writeMemoryFile(path.join(memoryDir, 'core', 'project', 'roadmap.md'), '# Roadmap', { description: 'Roadmap' });

  const pi = createMockPi();
  registerMemoryList(pi, settings);

  const allFiles = await executeTool(pi, 'memory_list', {}, projectDir);
  const userFiles = await executeTool(pi, 'memory_list', { directory: 'core/user' }, projectDir);

  assert.equal(allFiles.details?.count, 2);
  assert.deepEqual((allFiles.details?.files ?? []).sort(), ['core/project/roadmap.md', 'core/user/identity.md'].sort());
  assert.equal(userFiles.details?.count, 1);
  assert.deepEqual(userFiles.details?.files, ['core/user/identity.md']);
});

test('memory_check treats missing global memory as warning when project memory exists', async () => {
  const tempDir = createTempDir('pi-context-tools-check-global');
  const projectDir = path.join(tempDir, 'project');
  const settings = { localPath: path.join(tempDir, 'memory-root'), memoryDir: { globalMemory: 'global' } };
  const projectMemoryDir = path.join(settings.localPath, path.basename(projectDir));

  writeMemoryFile(path.join(projectMemoryDir, 'core', 'project', 'overview.md'), '# Overview', {
    description: 'Project overview',
  });

  const pi = createMockPi();
  registerMemoryCheck(pi, settings);

  const result = await executeTool(pi, 'memory_check', {}, projectDir);
  assert.equal(result.details?.globalMemoryMissing, true);
  assert.equal(result.details?.fileCount, 1);
  assert.match(result.content[0]?.text ?? '', /Warning: shared global memory directory not found:/);
});

test('memory_search handles query grep rg and empty results', async () => {
  const tempDir = createTempDir('pi-context-tools-search');
  const projectDir = path.join(tempDir, 'project');
  const settings = { localPath: path.join(tempDir, 'memory-root') };
  const memoryDir = path.join(settings.localPath, path.basename(projectDir));
  const coreDir = path.join(memoryDir, 'core');
  const identityPath = path.join(coreDir, 'user', 'identity.md');
  const roadmapPath = path.join(coreDir, 'project', 'roadmap.md');

  writeMemoryFile(identityPath, '# Identity', { description: 'User identity', tags: ['profile'] });
  writeMemoryFile(roadmapPath, '# Roadmap', { description: 'Release roadmap', tags: ['release'] });

  const pi = createMockPi((command, args) => {
    if (command === 'grep') {
      const pattern = args[5];
      if (pattern === '^\\s*-\\s*release') return { stdout: `${roadmapPath}:3:- release\n` };
      if (pattern === '^description:\\s*.*release') return { stdout: `${roadmapPath}:2:description: Release roadmap\n` };
      if (pattern === 'road') return { stdout: `${roadmapPath}:5:# Roadmap\n` };
    }
    if (command === 'rg' && args[4] === 'identity') return { stdout: `${identityPath}:4:# Identity\n` };
    return { stdout: '' };
  });

  registerMemorySearch(pi, settings);

  const queryResult = await executeTool(pi, 'memory_search', { query: 'release' }, projectDir);
  const grepResult = await executeTool(pi, 'memory_search', { grep: 'road' }, projectDir);
  const rgResult = await executeTool(pi, 'memory_search', { rg: 'identity' }, projectDir);
  const emptyResult = await executeTool(pi, 'memory_search', { query: 'missing' }, projectDir);

  assert.equal(queryResult.details?.count, 1);
  assert.deepEqual(queryResult.details?.files, ['core/project/roadmap.md']);
  assert.match(queryResult.content[0]?.text ?? '', /## Tags matching: release/);
  assert.match(queryResult.content[0]?.text ?? '', /## Description matching: release/);
  assert.equal(grepResult.details?.count, 1);
  assert.match(grepResult.content[0]?.text ?? '', /## Custom grep: road/);
  assert.equal(rgResult.details?.count, 1);
  assert.deepEqual(rgResult.details?.files, ['core/user/identity.md']);
  assert.equal(emptyResult.details?.count, 0);
});
