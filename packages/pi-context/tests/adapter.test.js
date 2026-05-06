import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeMemoryFile } from '@pi-context/pi-memory-core';

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function initGitRepo(repoPath) {
  fs.mkdirSync(repoPath, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repoPath, stdio: 'ignore' });
}

function createMockPi(execImpl = async () => ({ stdout: '' })) {
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
      return execImpl(...arguments);
    },
    sendMessage(message) {
      messages.push(message);
    },
  };
}

function createCtx(overrides = {}) {
  return {
    cwd: process.cwd(),
    ui: { notify() {} },
    sessionManager: { getSessionId() { return 'session-1'; } },
    ...overrides,
  };
}

test('pi-context exports adapter shell default extension', async () => {
  const mod = await import('../src/index.ts');
  assert.equal(typeof mod.default, 'function');
  assert.equal(mod.packageInfo.name, 'pi-context');
  assert.equal(mod.packageInfo.stage, 'adapter-shell');
});

test('adapter shell registers core lifecycle commands and tools', async () => {
  const { registerAdapterShell } = await import('../src/bootstrap/index.ts');
  const pi = createMockPi();

  registerAdapterShell(pi, {
    enabled: true,
    tape: { enabled: true },
  });

  assert.equal(typeof pi.handlers.get('tool_call'), 'function');
  assert.equal(typeof pi.handlers.get('before_agent_start'), 'function');
  assert.equal(pi.commands.has('memory-refresh'), true);
  assert.equal(pi.commands.has('memory-check'), true);
  assert.equal(pi.commands.has('memory-anchor'), true);
  assert.equal(pi.commands.has('memory-review'), true);
  assert.match(pi.commands.get('memory-review').description, /summary/i);
  assert.equal(pi.tools.has('memory_list'), true);
  assert.equal(pi.tools.has('memory_search'), true);
  assert.equal(pi.tools.has('memory_check'), true);
});

test('memory-anchor queues a manual tape handoff request', async () => {
  const { registerAdapterShell } = await import('../src/bootstrap/index.ts');
  const pi = createMockPi();
  const notices = [];

  registerAdapterShell(pi, {
    enabled: true,
    tape: { enabled: true, anchor: { mode: 'manual' } },
  });

  const command = pi.commands.get('memory-anchor');
  await command.handler('ship release build', createCtx({ ui: { notify(message, level) { notices.push({ message, level }); } } }));

  assert.equal(pi.messages.length, 1);
  assert.equal(pi.messages[0].customType, 'pi-context-tape-manual-anchor');
  assert.match(pi.messages[0].content, /The user explicitly requested a manual tape anchor via \/memory-anchor\./);
  assert.match(pi.messages[0].content, /User prompt: ship release build/);
  assert.deepEqual(notices.at(-1), { message: 'Manual anchor request queued', level: 'info' });
});

test('memory-review reports unavailable when tape runtime is unavailable', async () => {
  const { registerAdapterShell } = await import('../src/bootstrap/index.ts');
  const pi = createMockPi();
  const notices = [];

  registerAdapterShell(pi, {
    enabled: true,
    tape: { enabled: true, onlyGit: true },
  });

  const command = pi.commands.get('memory-review');
  await command.handler('', createCtx({ cwd: createTempDir('pi-context-no-git'), ui: { notify(message, level) { notices.push({ message, level }); } } }));

  assert.deepEqual(notices.at(-1), { message: 'Tape runtime is unavailable.', level: 'error' });
});

test('memory-review shows minimal tape summary when runtime is available', async () => {
  const { registerAdapterShell } = await import('../src/bootstrap/index.ts');
  const tempDir = createTempDir('pi-context-memory-review');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));
  const notices = [];

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  initGitRepo(projectDir);

  const pi = createMockPi();
  registerAdapterShell(pi, {
    enabled: true,
    localPath,
    tape: { enabled: true, onlyGit: true },
  });

  const handoff = pi.tools.get('tape_handoff');
  await handoff.execute('call-1', { name: 'task/one', summary: 'first', purpose: 'build' }, undefined, undefined, {
    cwd: projectDir,
    ui: { notify() {} },
    sessionManager: { getSessionId() { return 'session-1'; }, getLeafId() { return 'entry-1'; } },
  });

  const command = pi.commands.get('memory-review');
  await command.handler('7', createCtx({ cwd: projectDir, ui: { notify(message, level) { notices.push({ message, level }); } } }));

  assert.equal(notices.length > 0, true);
  assert.match(notices.at(-1).message, /Memory Review Summary/);
  assert.match(notices.at(-1).message, /Scope: session/);
  assert.match(notices.at(-1).message, /task\/one/);
  assert.match(notices.at(-1).message, /Anchors: 1/);
  assert.doesNotMatch(notices.at(-1).message, /session\/new/);
  assert.deepEqual(notices.at(-1).level, 'info');
});

test('memory-review clamps limit and excludes session-prefixed anchors', async () => {
  const { registerAdapterShell } = await import('../src/bootstrap/index.ts');
  const tempDir = createTempDir('pi-context-memory-review-limit');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));
  const notices = [];

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  initGitRepo(projectDir);

  const pi = createMockPi();
  registerAdapterShell(pi, {
    enabled: true,
    localPath,
    tape: { enabled: true, onlyGit: true },
  });

  const handoff = pi.tools.get('tape_handoff');
  for (const name of ['session/new', 'task/one', 'task/two']) {
    await handoff.execute('call', { name, summary: name, purpose: 'build' }, undefined, undefined, {
      cwd: projectDir,
      ui: { notify() {} },
      sessionManager: { getSessionId() { return 'session-1'; }, getLeafId() { return `entry-${name}`; } },
    });
  }

  const command = pi.commands.get('memory-review');
  await command.handler('999', createCtx({ cwd: projectDir, ui: { notify(message, level) { notices.push({ message, level }); } } }));

  assert.match(notices.at(-1).message, /Anchors: 2/);
  assert.match(notices.at(-1).message, /Showing: 2 of 2/);
  assert.match(notices.at(-1).message, /task\/one/);
  assert.match(notices.at(-1).message, /task\/two/);
  assert.doesNotMatch(notices.at(-1).message, /session\/new/);
});

test('memory-check reports uninitialized memory with setup hint', async () => {
  const { registerAdapterShell } = await import('../src/bootstrap/index.ts');
  const tempDir = createTempDir('pi-context-memory-check-uninit');
  const projectDir = path.join(tempDir, 'project');
  const notices = [];
  initGitRepo(projectDir);

  const pi = createMockPi();
  registerAdapterShell(pi, { enabled: true, localPath: path.join(tempDir, 'memory-root') });

  const command = pi.commands.get('memory-check');
  await command.handler('', createCtx({ cwd: projectDir, ui: { notify(message, level) { notices.push({ message, level }); } } }));

  assert.match(notices[0].message, /Repo: Not initialized/);
  assert.match(notices[0].message, /Use \/memory-init to set up/);
  assert.equal(notices[0].level, 'info');
});

test('memory-check reports repo status and tree output for initialized memory', async () => {
  const { registerAdapterShell } = await import('../src/bootstrap/index.ts');
  const tempDir = createTempDir('pi-context-memory-check-init');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));
  const notices = [];

  initGitRepo(projectDir);
  initGitRepo(localPath);
  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  writeMemoryFile(path.join(memoryDir, 'core', 'project', 'roadmap.md'), '# Roadmap', { description: 'Roadmap' });

  const pi = createMockPi(async (command, args) => {
    if (command === 'git' && args.join(' ') === 'status --porcelain') {
      return { stdout: ' M core/project/roadmap.md\n' };
    }
    return { stdout: '' };
  });
  registerAdapterShell(pi, { enabled: true, localPath });

  const command = pi.commands.get('memory-check');
  await command.handler('10', createCtx({ cwd: projectDir, ui: { notify(message, level) { notices.push({ message, level }); } } }));

  assert.match(notices[0].message, /Repo: Uncommitted changes/);
  assert.match(notices[0].message, /Files: 2/);
  assert.equal(notices[0].level, 'warning');
  assert.match(notices[1].message, /core\/user\/identity.md/);
  assert.match(notices[1].message, /core\/project\/roadmap.md/);
  assert.equal(notices[1].level, 'info');
});

test('before_agent_start returns appended memory context when available', async () => {
  const mod = await import('../src/index.ts');
  const pi = createMockPi();
  mod.default(pi);

  const handler = pi.handlers.get('before_agent_start');
  const result = await handler?.({ prompt: 'hello', systemPrompt: 'base prompt' }, createCtx());

  if (result?.message) {
    assert.equal(result.message.display, false);
    assert.match(result.message.customType, /pi-context-memory/);
  } else if (result?.systemPrompt) {
    assert.match(result.systemPrompt, /base prompt/);
  } else {
    assert.equal(result, undefined);
  }
});
