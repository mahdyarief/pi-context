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

function createCtx(cwd, sessionId = 'session-1', entryId = 'entry-1', labelsById = new Map(), labelTimestampsById = new Map()) {
  return {
    cwd,
    ui: { notify() {} },
    sessionManager: {
      getSessionId() { return sessionId; },
      getLeafId() { return entryId; },
      getLabel(id) { return labelsById.get(id); },
      labelsById,
      labelTimestampsById,
    },
  };
}

test('tape_list, tape_info, tape_delete, and tape_reset operate on persisted anchors', async () => {
  const tempDir = createTempDir('pi-context-tape-tools');
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
      anchor: { mode: 'auto' },
    },
  });

  const handoff = pi.tools.get('tape_handoff');
  const list = pi.tools.get('tape_list');
  const info = pi.tools.get('tape_info');
  const del = pi.tools.get('tape_delete');
  const reset = pi.tools.get('tape_reset');

  assert.ok(handoff);
  assert.ok(list);
  assert.ok(info);
  assert.ok(del);
  assert.ok(reset);

  const labelsById = new Map([['entry-1', 'Base one'], ['entry-2', 'Base two'], ['entry-9', 'Reset base']]);
  const labelTimestampsById = new Map();

  const first = await handoff.execute('call-1', { name: 'task/one', summary: 'first', purpose: 'build' }, undefined, undefined, createCtx(projectDir, 'session-1', 'entry-1', labelsById, labelTimestampsById));
  const second = await handoff.execute('call-2', { name: 'task/two', summary: 'second', purpose: 'test' }, undefined, undefined, createCtx(projectDir, 'session-1', 'entry-2', labelsById, labelTimestampsById));

  const listResult = await list.execute('call-3', { limit: 10 }, undefined, undefined, createCtx(projectDir));
  assert.equal(listResult.details.count, 2);
  assert.equal(listResult.details.anchors.length, 2);
  assert.match(listResult.content[0].text, /task\/one/);
  assert.match(listResult.content[0].text, /task\/two/);

  const infoResult = await info.execute('call-4', {}, undefined, undefined, createCtx(projectDir));
  assert.equal(infoResult.details.anchorCount, 2);
  assert.equal(infoResult.details.lastAnchorName, 'task/two');
  assert.equal(infoResult.details.lastAnchorId, second.details.anchorId);

  const deleteResult = await del.execute('call-5', { id: first.details.anchorId }, undefined, undefined, createCtx(projectDir, 'session-1', 'entry-1', labelsById, labelTimestampsById));
  assert.equal(deleteResult.details.deleted, true);
  assert.equal(deleteResult.details.name, 'task/one');
  assert.equal(labelsById.get('entry-1'), 'Base one');
  assert.equal(labelsById.get('entry-2'), 'Base two · ⚓ task/two');

  const listAfterDelete = await list.execute('call-6', { limit: 10 }, undefined, undefined, createCtx(projectDir));
  assert.equal(listAfterDelete.details.count, 1);
  assert.equal(listAfterDelete.details.anchors[0].name, 'task/two');

  const missingDelete = await del.execute('call-7', { id: 'missing-anchor' }, undefined, undefined, createCtx(projectDir));
  assert.equal(missingDelete.details.deleted, false);

  const resetResult = await reset.execute('call-8', {}, undefined, undefined, createCtx(projectDir, 'session-1', 'entry-9', labelsById, labelTimestampsById));
  assert.equal(resetResult.details.clearedCount, 1);
  assert.equal(resetResult.details.anchorCount, 1);
  assert.equal(resetResult.details.lastAnchorName, 'session/new');
  assert.equal(labelsById.get('entry-1'), 'Base one');
  assert.equal(labelsById.get('entry-2'), 'Base two');
  assert.equal(labelsById.get('entry-9'), 'Reset base · ⚓ session/new');

  const listAfterReset = await list.execute('call-9', { limit: 10 }, undefined, undefined, createCtx(projectDir));
  assert.equal(listAfterReset.details.count, 1);
  assert.equal(listAfterReset.details.anchors[0].name, 'session/new');
  assert.equal(listAfterReset.details.anchors[0].meta.trigger, 'direct');
});
