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

function createUi() {
  const notifications = [];
  return {
    notifications,
    notify(message, level) {
      notifications.push({ message, level });
    },
  };
}

function createMockPi(execHandler) {
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const messages = [];
  const execCalls = [];

  return {
    handlers,
    commands,
    tools,
    messages,
    execCalls,
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerCommand(name, config) {
      commands.set(name, config);
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    async exec(command, args, options) {
      execCalls.push({ command, args, cwd: options?.cwd });
      if (execHandler) return execHandler(command, args, options);
      return { stdout: '' };
    },
    sendMessage(message) {
      messages.push(message);
    },
  };
}

function initGitRepo(repoPath) {
  fs.mkdirSync(repoPath, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repoPath, stdio: 'ignore' });
}

function createCtx(cwd, ui = createUi(), sessionId = 'session-1', entryId = 'entry-1', labelsById = new Map(), labelTimestampsById = new Map()) {
  return {
    cwd,
    ui,
    sessionManager: {
      getSessionId() { return sessionId; },
      getLeafId() { return entryId; },
      getLabel(id) { return labelsById.get(id); },
      labelsById,
      labelTimestampsById,
    },
  };
}

test('session_start runs start hooks and before_agent_start waits for them', async () => {
  const tempDir = createTempDir('pi-context-lifecycle-start');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  initGitRepo(localPath);

  let behindChecks = 0;
  const pi = createMockPi(async (_command, args) => {
    const gitCommand = args.join(' ');
    if (gitCommand === 'rev-parse --git-path FETCH_HEAD') return { stdout: '.git/FETCH_HEAD\n' };
    if (gitCommand === 'fetch') return { stdout: '' };
    if (gitCommand === 'rev-parse --abbrev-ref @{u}') return { stdout: 'origin/main\n' };
    if (gitCommand === 'rev-list --count HEAD..@{u}') {
      behindChecks += 1;
      return { stdout: behindChecks === 1 ? '1\n' : '0\n' };
    }
    if (gitCommand === 'rebase --autostash @{u}') return { stdout: 'Successfully rebased\n' };
    throw new Error(`Unexpected git call: ${gitCommand}`);
  });

  registerAdapterShell(pi, {
    enabled: true,
    localPath,
    repoUrl: 'https://github.com/acme/memory.git',
    hooks: { sessionStart: ['pull'] },
  });

  const sessionStart = pi.handlers.get('session_start');
  const beforeAgentStart = pi.handlers.get('before_agent_start');
  const ui = createUi();

  await sessionStart?.({ reason: 'resume' }, createCtx(projectDir, ui));
  const result = await beforeAgentStart?.({ prompt: 'hello', systemPrompt: 'SYSTEM' }, createCtx(projectDir, ui));

  assert.deepEqual(pi.execCalls.map((call) => call.args.join(' ')), [
    'rev-parse --git-path FETCH_HEAD',
    'fetch',
    'rev-parse --abbrev-ref @{u}',
    'rev-list --count HEAD..@{u}',
    'rebase --autostash @{u}',
    'rev-parse --abbrev-ref @{u}',
    'rev-list --count HEAD..@{u}',
  ]);
  assert.equal(result.message.customType, 'pi-context-memory');
  assert.equal(ui.notifications.some((item) => item.message.includes('Pulled latest changes from [memory] (start/pull)')), true);
});

test('session_start records minimal tape session anchors', async () => {
  const tempDir = createTempDir('pi-context-lifecycle-tape-start');
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

  const sessionStart = pi.handlers.get('session_start');
  assert.ok(sessionStart);

  const firstLabels = new Map([['leaf-1', 'Base label']]);
  const firstLabelTimestamps = new Map();
  const secondLabels = new Map();
  const secondLabelTimestamps = new Map();

  await sessionStart({ reason: 'startup' }, createCtx(projectDir, createUi(), 'session-new', 'leaf-1', firstLabels, firstLabelTimestamps));
  await sessionStart({ reason: 'resume' }, createCtx(projectDir, createUi(), 'session-resume', 'leaf-2', secondLabels, secondLabelTimestamps));

  const anchorFile = path.join(localPath, 'TAPE', `${path.basename(projectDir)}__anchors.jsonl`);
  const anchors = fs.readFileSync(anchorFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

  assert.equal(anchors.length, 2);
  assert.equal(anchors[0].name, 'session/new');
  assert.equal(anchors[0].sessionId, 'session-new');
  assert.equal(anchors[0].sessionEntryId, 'leaf-1');
  assert.equal(anchors[1].name, 'session/resume');
  assert.equal(anchors[1].sessionId, 'session-resume');
  assert.equal(anchors[1].sessionEntryId, 'leaf-2');
  assert.equal(firstLabels.get('leaf-1'), 'Base label · ⚓ session/new');
  assert.equal(secondLabels.get('leaf-2'), '⚓ session/resume');
  assert.equal(typeof firstLabelTimestamps.get('leaf-1'), 'string');
  assert.equal(typeof secondLabelTimestamps.get('leaf-2'), 'string');
});

test('session_shutdown runs end hooks only when memory is initialized', async () => {
  const tempDir = createTempDir('pi-context-lifecycle-end');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  initGitRepo(localPath);

  const pi = createMockPi(async (_command, args) => {
    const gitCommand = args.join(' ');
    if (gitCommand === 'status --porcelain') return { stdout: ' M core/user/identity.md\n' };
    if (gitCommand === 'add .') return { stdout: '' };
    if (args[0] === 'commit') return { stdout: '[main abc123] Update memory\n' };
    if (gitCommand === 'push') return { stdout: 'done\n' };
    throw new Error(`Unexpected git call: ${gitCommand}`);
  });

  registerAdapterShell(pi, {
    enabled: true,
    localPath,
    repoUrl: 'https://github.com/acme/memory.git',
    hooks: { sessionEnd: ['push'] },
  });

  const sessionShutdown = pi.handlers.get('session_shutdown');
  const ui = createUi();

  await sessionShutdown?.({}, createCtx(projectDir, ui));
  assert.equal(pi.execCalls.some((call) => call.args[0] === 'push'), true);
  assert.equal(ui.notifications.some((item) => item.message.includes('[memory] pushed memory changes (end/push)')), true);

  fs.rmSync(memoryDir, { recursive: true, force: true });
  pi.execCalls.length = 0;
  ui.notifications.length = 0;

  await sessionShutdown?.({}, createCtx(projectDir, ui));
  assert.equal(pi.execCalls.length, 0);
  assert.equal(ui.notifications.length, 0);
});
