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

function createCtx(cwd, sessionId = 'session-1', entryId = 'entry-2') {
  return {
    cwd,
    ui: { notify() {} },
    sessionManager: {
      getSessionId() { return sessionId; },
      getLeafId() { return entryId; },
    },
  };
}

function encodeSessionPath(cwd) {
  return `--${cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`;
}

function writeSessionFile(agentDir, cwd, fileName, sessionId, entries) {
  const sessionDir = path.join(agentDir, 'sessions', encodeSessionPath(cwd));
  fs.mkdirSync(sessionDir, { recursive: true });
  const lines = [JSON.stringify({ type: 'session', id: sessionId }), ...entries.map((entry) => JSON.stringify(entry))];
  fs.writeFileSync(path.join(sessionDir, fileName), `${lines.join('\n')}\n`, 'utf8');
}

test('tape_search and tape_read work with persisted anchors and session files', async () => {
  const tempDir = createTempDir('pi-context-tape-search-read');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));
  const agentDir = path.join(tempDir, 'agent');
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  initGitRepo(projectDir);

  writeSessionFile(agentDir, projectDir, 'session-1.jsonl', 'session-1', [
    { id: 'entry-1', type: 'message', timestamp: '2026-04-23T10:00:00.000Z', parentId: null, message: { role: 'user', content: 'alpha bug' } },
    { id: 'entry-2', type: 'message', timestamp: '2026-04-23T10:10:00.000Z', parentId: 'entry-1', message: { role: 'assistant', content: 'beta fix' } },
    { id: 'entry-3', type: 'compaction', timestamp: '2026-04-23T10:20:00.000Z', summary: 'gamma summary' },
  ]);
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
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
    const search = pi.tools.get('tape_search');
    const read = pi.tools.get('tape_read');

    assert.ok(handoff);
    assert.ok(search);
    assert.ok(read);

    await handoff.execute('call-1', { name: 'task/one', summary: 'first', purpose: 'build' }, undefined, undefined, createCtx(projectDir, 'session-1', 'entry-1'));
    await handoff.execute('call-2', { name: 'task/two', summary: 'second', purpose: 'test' }, undefined, undefined, createCtx(projectDir, 'session-1', 'entry-2'));

    const anchorFile = path.join(localPath, 'TAPE', `${path.basename(projectDir)}__anchors.jsonl`);
    const saved = fs.readFileSync(anchorFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    saved[0].timestamp = '2026-04-23T10:05:00.000Z';
    saved[1].timestamp = '2026-04-23T10:15:00.000Z';
    fs.writeFileSync(anchorFile, `${saved.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');

    const searchAnchors = await search.execute('call-3', { kinds: ['anchor'], anchorName: 'task/', anchorSummary: 'second' }, undefined, undefined, createCtx(projectDir));
    assert.equal(searchAnchors.details.anchorCount, 1);
    assert.equal(searchAnchors.details.entryCount, 0);
    assert.match(searchAnchors.content[0].text, /task\/two/);

    const searchEntries = await search.execute('call-4', { kinds: ['entry'], scan: 'bug', entryScope: 'session' }, undefined, undefined, createCtx(projectDir));
    assert.equal(searchEntries.details.entryCount, 1);
    assert.match(searchEntries.content[0].text, /alpha bug/);

    const readAfterAnchor = await read.execute('call-5', { afterAnchor: 'task/one', entryScope: 'session', anchorScope: 'session' }, undefined, undefined, createCtx(projectDir));
    assert.equal(readAfterAnchor.details.count, 2);
    assert.match(readAfterAnchor.content[0].text, /beta fix/);
    assert.match(readAfterAnchor.content[0].text, /gamma summary/);

    const readBetweenDates = await read.execute('call-6', { betweenDates: { start: '2026-04-23T10:05:00.000Z', end: '2026-04-23T10:15:00.000Z' }, entryScope: 'session' }, undefined, undefined, createCtx(projectDir));
    assert.equal(readBetweenDates.details.count, 1);
    assert.match(readBetweenDates.content[0].text, /beta fix/);
  } finally {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
  }
});
