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

function createUi() {
  const notifications = [];
  return {
    notifications,
    notify(message, level) {
      notifications.push({ message, level });
    },
  };
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

function createCtx(cwd, ui = createUi()) {
  return {
    cwd,
    ui,
    sessionManager: { getSessionId() { return 'session-1'; } },
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

test('before_agent_start uses tape context in message-append mode and queues keyword handoff once', async () => {
  const tempDir = createTempDir('pi-context-tape-keyword');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  writeMemoryFile(path.join(memoryDir, 'core', 'project', 'roadmap.md'), '# Roadmap', { description: 'Roadmap' });
  fs.mkdirSync(path.join(memoryDir, 'reference'), { recursive: true });
  initGitRepo(projectDir);

  const pi = createMockPi();
  registerAdapterShell(pi, {
    enabled: true,
    localPath,
    delivery: 'message-append',
    tape: {
      enabled: true,
      onlyGit: true,
      context: { strategy: 'recent-only', fileLimit: 5 },
      anchor: { mode: 'manual', keywords: { global: ['tape'] } },
    },
  });

  const beforeAgentStart = pi.handlers.get('before_agent_start');
  const ui = createUi();

  const first = await beforeAgentStart?.({ prompt: 'please help with tape labels', systemPrompt: 'SYSTEM' }, createCtx(projectDir, ui));
  const second = await beforeAgentStart?.({ prompt: 'please help with tape labels', systemPrompt: 'SYSTEM' }, createCtx(projectDir, ui));

  assert.equal(first.message.customType, 'pi-context-tape');
  assert.match(first.message.content, /<memory_context mode="tape">/);
  assert.match(first.message.content, /Tape is enabled/);
  assert.match(first.message.content, /Handoff mode: manual/);
  assert.equal(second, undefined);
  assert.equal(pi.messages.length, 2);
  assert.equal(pi.messages[0].message.customType, 'pi-context-tape-keyword');
  assert.equal(pi.messages[1].message.customType, 'pi-context-tape-keyword');
  assert.equal(ui.notifications.some((item) => item.message.includes('Tape keyword detected: tape')), true);
  assert.equal(ui.notifications.some((item) => item.message.includes('Tape mode: 2 memory files delivered (message-append)')), true);
});

test('tool_call blocks direct tape_handoff in manual mode but allows matching keyword anchor', async () => {
  const tempDir = createTempDir('pi-context-tape-tool-call');
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

  const toolCall = pi.handlers.get('tool_call');
  const beforeAgentStart = pi.handlers.get('before_agent_start');

  const directResult = await toolCall?.({ toolName: 'tape_handoff', toolCallId: 'call-1', input: { name: 'task/direct' } }, createCtx(projectDir));
  assert.equal(directResult.block, true);
  assert.match(directResult.reason, /tape_handoff is disabled/);

  await beforeAgentStart?.({ prompt: 'please help with tape labels', systemPrompt: 'SYSTEM' }, createCtx(projectDir));
  const keywordAnchorName = String(pi.messages.at(-1)?.message.content).match(/- name: "([^"]+)"/)?.[1];
  const allowedResult = await toolCall?.({ toolName: 'tape_handoff', toolCallId: 'call-2', input: { name: keywordAnchorName } }, createCtx(projectDir));
  assert.equal(allowedResult, undefined);

  const blockedOther = await toolCall?.({ toolName: 'tape_handoff', toolCallId: 'call-3', input: { name: 'handoff/other' } }, createCtx(projectDir));
  assert.equal(blockedOther.block, true);
});

test('before_agent_start uses tape context in system-prompt mode and keeps delivering on later calls', async () => {
  const tempDir = createTempDir('pi-context-tape-system-prompt');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  writeMemoryFile(path.join(memoryDir, 'core', 'project', 'roadmap.md'), '# Roadmap', { description: 'Roadmap' });
  initGitRepo(projectDir);

  const pi = createMockPi();
  registerAdapterShell(pi, {
    enabled: true,
    localPath,
    delivery: 'system-prompt',
    tape: {
      enabled: true,
      onlyGit: true,
      context: { strategy: 'recent-only', fileLimit: 5 },
    },
  });

  const beforeAgentStart = pi.handlers.get('before_agent_start');
  const first = await beforeAgentStart?.({ prompt: 'hello', systemPrompt: 'SYSTEM' }, createCtx(projectDir));
  const second = await beforeAgentStart?.({ prompt: 'hello again', systemPrompt: 'SYSTEM' }, createCtx(projectDir));

  assert.match(first.systemPrompt, /SYSTEM/);
  assert.match(first.systemPrompt, /<memory_context mode="tape">/);
  assert.match(first.systemPrompt, /Tape is enabled/);
  assert.match(second.systemPrompt, /<memory_context mode="tape">/);
  assert.equal(pi.messages.length, 0);
});

test('before_agent_start smart tape context ranks newer references first and filters ignored paths', async () => {
  const tempDir = createTempDir('pi-context-tape-smart');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));
  const agentDir = path.join(tempDir, 'agent');
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  writeMemoryFile(path.join(memoryDir, 'core', 'project', 'roadmap.md'), '# Roadmap', { description: 'Roadmap' });
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'src', 'hot.ts'), 'export const hot = true;\n');
  fs.writeFileSync(path.join(projectDir, 'src', 'older.ts'), 'export const older = true;\n');
  fs.writeFileSync(path.join(projectDir, 'docs', 'guide.md'), '# Guide\n');
  fs.writeFileSync(path.join(projectDir, 'dist', 'bundle.js'), 'console.log(true);\n');
  fs.writeFileSync(path.join(projectDir, 'node_modules', 'pkg', 'index.js'), 'module.exports = true;\n');
  initGitRepo(projectDir);

  writeSessionFile(agentDir, projectDir, 'session-1.jsonl', 'session-1', [
    {
      id: 'entry-1',
      type: 'message',
      timestamp: '2026-04-23T10:00:00.000Z',
      parentId: null,
      message: {
        role: 'assistant',
        content: [
          { type: 'toolCall', name: 'read', arguments: { path: 'src/older.ts' } },
          { type: 'toolCall', name: 'read', arguments: { path: 'node_modules/pkg/index.js' } },
        ],
      },
    },
    {
      id: 'entry-2',
      type: 'message',
      timestamp: '2026-04-23T11:00:00.000Z',
      parentId: 'entry-1',
      message: {
        role: 'assistant',
        content: [
          { type: 'toolCall', name: 'read', arguments: { path: 'src/hot.ts' } },
          { type: 'toolCall', name: 'write', arguments: { path: 'dist/bundle.js' } },
        ],
      },
    },
  ]);
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    const pi = createMockPi();
    registerAdapterShell(pi, {
      enabled: true,
      localPath,
      delivery: 'message-append',
      tape: {
        enabled: true,
        onlyGit: true,
        context: {
          strategy: 'smart',
          fileLimit: 3,
          whitelist: ['docs'],
          blacklist: ['dist'],
        },
      },
    });

    const beforeAgentStart = pi.handlers.get('before_agent_start');
    const result = await beforeAgentStart?.({ prompt: 'hello', systemPrompt: 'SYSTEM' }, createCtx(projectDir));

    assert.equal(result.message.customType, 'pi-context-tape');
    assert.match(result.message.content, /src[\\/]hot\.ts/);
    assert.match(result.message.content, /src[\\/]older\.ts/);
    assert.match(result.message.content, /docs[\\/]guide\.md/);
    assert.doesNotMatch(result.message.content, /dist[\\/]bundle\.js/);
    assert.doesNotMatch(result.message.content, /node_modules[\\/]pkg[\\/]index\.js/);
    assert.ok(result.message.content.indexOf('src\\hot.ts') < result.message.content.indexOf('src\\older.ts') || result.message.content.indexOf('src/hot.ts') < result.message.content.indexOf('src/older.ts'));
  } finally {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
  }
});

test('before_agent_start smart tape context injects recent conversation excerpt', async () => {
  const tempDir = createTempDir('pi-context-tape-excerpt');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));
  const agentDir = path.join(tempDir, 'agent');
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const now = Date.now();
  const hoursAgo = (hours) => new Date(now - hours * 60 * 60 * 1000).toISOString();

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'src', 'hot.ts'), 'export const hot = true;\n');
  initGitRepo(projectDir);

  writeSessionFile(agentDir, projectDir, 'session-1.jsonl', 'session-1', [
    {
      id: 'entry-1',
      type: 'message',
      timestamp: hoursAgo(4),
      parentId: null,
      message: { role: 'user', content: 'Need revisit hot path logic' },
    },
    {
      id: 'entry-2',
      type: 'message',
      timestamp: hoursAgo(3),
      parentId: 'entry-1',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking recent project file usage now.' },
          { type: 'toolCall', name: 'read', arguments: { path: 'src/hot.ts' } },
        ],
      },
    },
  ]);
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    const pi = createMockPi();
    registerAdapterShell(pi, {
      enabled: true,
      localPath,
      delivery: 'message-append',
      tape: {
        enabled: true,
        onlyGit: true,
        context: {
          strategy: 'smart',
          fileLimit: 3,
          memoryScan: [24, 48],
        },
      },
    });

    const beforeAgentStart = pi.handlers.get('before_agent_start');
    const result = await beforeAgentStart?.({ prompt: 'hello', systemPrompt: 'SYSTEM' }, createCtx(projectDir));

    assert.equal(result.message.customType, 'pi-context-tape');
    assert.match(result.message.content, /<recent_conversation>/);
    assert.match(result.message.content, /User: Need revisit hot path logic/);
    assert.match(result.message.content, /Assistant: Checking recent project file usage now\./);
    assert.match(result.message.content, /<\/recent_conversation>/);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  }
});

test('before_agent_start smart tape context respects memoryScan window expansion', async () => {
  const tempDir = createTempDir('pi-context-tape-memory-scan');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));
  const agentDir = path.join(tempDir, 'agent');
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const now = Date.now();
  const hoursAgo = (hours) => new Date(now - hours * 60 * 60 * 1000).toISOString();

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'src', 'mid.ts'), 'export const mid = true;\n');
  fs.writeFileSync(path.join(projectDir, 'src', 'old.ts'), 'export const old = true;\n');
  initGitRepo(projectDir);

  writeSessionFile(agentDir, projectDir, 'session-1.jsonl', 'session-1', [
    {
      id: 'entry-1',
      type: 'message',
      timestamp: hoursAgo(80),
      parentId: null,
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', name: 'read', arguments: { path: 'src/old.ts' } }],
      },
    },
    {
      id: 'entry-2',
      type: 'message',
      timestamp: hoursAgo(36),
      parentId: 'entry-1',
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', name: 'read', arguments: { path: 'src/mid.ts' } }],
      },
    },
  ]);
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    const pi = createMockPi();
    registerAdapterShell(pi, {
      enabled: true,
      localPath,
      delivery: 'message-append',
      tape: {
        enabled: true,
        onlyGit: true,
        context: {
          strategy: 'smart',
          fileLimit: 3,
          memoryScan: [24, 48],
        },
      },
    });

    const beforeAgentStart = pi.handlers.get('before_agent_start');
    const result = await beforeAgentStart?.({ prompt: 'hello', systemPrompt: 'SYSTEM' }, createCtx(projectDir));

    assert.equal(result.message.customType, 'pi-context-tape');
    assert.match(result.message.content, /src[\\/]mid\.ts/);
    assert.doesNotMatch(result.message.content, /src[\\/]old\.ts/);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  }
});

test('before_agent_start skips tape keyword messaging when onlyGit is true outside git repos', async () => {
  const tempDir = createTempDir('pi-context-tape-gate');
  const projectDir = path.join(tempDir, 'project');
  const localPath = path.join(tempDir, 'memory-root');
  const memoryDir = path.join(localPath, path.basename(projectDir));

  writeMemoryFile(path.join(memoryDir, 'core', 'user', 'identity.md'), '# Identity', { description: 'Identity' });

  const pi = createMockPi();
  registerAdapterShell(pi, {
    enabled: true,
    localPath,
    tape: {
      enabled: true,
      onlyGit: true,
      anchor: { keywords: { global: ['tape'] } },
    },
  });

  const beforeAgentStart = pi.handlers.get('before_agent_start');
  const ui = createUi();

  await beforeAgentStart?.({ prompt: 'please help with tape labels', systemPrompt: 'SYSTEM' }, createCtx(projectDir, ui));

  assert.equal(pi.messages.length, 0);
  assert.equal(ui.notifications.some((item) => item.message.includes('Tape keyword detected:')), false);
});
