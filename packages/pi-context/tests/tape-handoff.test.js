import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeMemoryFile } from '@pi-context/pi-memory-core';
import { registerAdapterShell } from '../src/bootstrap/index.ts';

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function initGitRepo(repoPath) {
  fs.mkdirSync(repoPath, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repoPath, stdio: 'ignore' });
}

function createMockPi() {
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const messages = [];

  return {
    handlers,
    commands,
    tools,
    messages,
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerCommand(name, config) {
      commands.set(name, config);
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    async exec() {
      return { stdout: '' };
    },
    sendMessage(message, options) {
      messages.push({ message, options });
    },
  };
}

function createCtx(cwd, sessionId = 'session-1', labelsById = new Map(), labelTimestampsById = new Map()) {
  return {
    cwd,
    ui: { notify() {} },
    sessionManager: {
      getSessionId() { return sessionId; },
      getLeafId() { return 'entry-1'; },
      getLabel(id) { return labelsById.get(id); },
      labelsById,
      labelTimestampsById,
    },
  };
}

test('adapter registers tape_handoff and creates persisted anchors with trigger metadata', async () => {
  const tempDir = createTempDir('pi-context-tape-handoff');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  initGitRepo(projectDir);

  const pi = createMockPi();
  registerAdapterShell(pi, {
    enabled: true,
    localPath,
    tape: {
      enabled: true,
      onlyGit: true,
      anchor: { mode: 'manual', keywords: { global: ['tape'] } },
    },
  });

  assert.equal(pi.tools.has('tape_handoff'), true);
  const tool = pi.tools.get('tape_handoff');
  const labelsById = new Map([['entry-1', 'Base label']]);
  const labelTimestampsById = new Map();

  const blocked = await tool.execute('call-1', { name: 'task/direct', summary: 'manual test' }, undefined, undefined, createCtx(projectDir, 'session-1', labelsById, labelTimestampsById));
  assert.match(blocked.content[0].text, /disabled when tape\.anchor\.mode="manual"/);
  assert.equal(blocked.details.disabled, true);

  const beforeAgentStart = pi.handlers.get('before_agent_start');
  await beforeAgentStart?.({ prompt: 'please help with tape labels', systemPrompt: 'SYSTEM' }, createCtx(projectDir, 'session-1', labelsById, labelTimestampsById));
  const keywordAnchorName = String(pi.messages.at(-1)?.message.content).match(/- name: "([^"]+)"/)?.[1];

  const keywordResult = await tool.execute(
    'call-2',
    { name: keywordAnchorName, summary: 'kw', purpose: 'test' },
    undefined,
    undefined,
    createCtx(projectDir, 'session-1', labelsById, labelTimestampsById),
  );

  assert.equal(keywordResult.details.finalTrigger, 'keyword');
  assert.equal(keywordResult.details.matchedKeywordHandoff, true);
  assert.equal(keywordResult.details.name, keywordAnchorName);
  assert.equal(labelsById.get('entry-1'), `Base label · ⚓ ${keywordAnchorName}`);
  assert.equal(typeof labelTimestampsById.get('entry-1'), 'string');

  const anchorFile = path.join(localPath, 'TAPE', `${path.basename(projectDir)}__anchors.jsonl`);
  const lines = fs.readFileSync(anchorFile, 'utf8').trim().split('\n');
  const saved = JSON.parse(lines.at(-1));
  assert.equal(saved.name, keywordAnchorName);
  assert.equal(saved.type, 'handoff');
  assert.equal(saved.sessionId, 'session-1');
  assert.equal(saved.sessionEntryId, 'entry-1');
  assert.deepEqual(saved.meta, { summary: 'kw', purpose: 'test', trigger: 'keyword', keywords: ['tape'] });
});
