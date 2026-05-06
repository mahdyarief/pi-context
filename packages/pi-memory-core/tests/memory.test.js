import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTempDir, initGitRepo, writeJson, writeText } from './test-helpers.js';

test('loadSettings merges defaults and sanitizes project overrides', async () => {
  const core = await import('../src/index.ts');
  const tempHome = createTempDir('pi-context-home');
  const projectDir = createTempDir('pi-context-project');

  writeJson(path.join(tempHome, '.pi', 'agent', 'settings.json'), {
    'pi-context': {
      repoUrl: 'https://github.com/acme/global-memory.git',
      localPath: '~/global-memory',
      delivery: 'system-prompt',
      memoryDir: { globalMemory: 'global' },
      tape: {
        enabled: true,
        context: {
          memoryScan: [3.8, 1.2],
          whitelist: [' core/user/identity.md ', 'core/user/identity.md'],
        },
        anchor: {
          mode: 'manual',
          keywords: { global: [' Foo ', 'foo'] },
        },
      },
    },
  });

  writeJson(path.join(projectDir, '.pi', 'settings.json'), {
    'pi-context': {
      repoUrl: 'https://github.com/acme/project-memory.git',
      localPath: '~/custom-memory',
      hooks: { sessionStart: ['push', '', 'pull'], sessionEnd: ['push'] },
      memoryDir: { globalMemory: 'project-global' },
      tape: {
        tapePath: '~/project-tape',
        excludeDirs: ['~/blocked', 'relative/path'],
        context: {
          fileLimit: 3,
          memoryScan: [10.9, 5.1],
          alwaysInclude: [' docs/tape-design.md '],
          blacklist: [' node_modules ', 'node_modules'],
        },
        anchor: {
          mode: 'invalid',
          keywords: { project: [' Bar ', 'bar'] },
        },
      },
    },
  });

  const homedirMock = mock.method(os, 'homedir', () => tempHome);
  try {
    const settings = core.loadSettings(projectDir);
    assert.equal(settings.repoUrl, 'https://github.com/acme/global-memory.git');
    assert.equal(settings.localPath, path.join(tempHome, 'global-memory'));
    assert.equal(settings.delivery, 'system-prompt');
    assert.equal(settings.injection, 'system-prompt');
    assert.equal(settings.tape?.enabled, true);
    assert.equal(settings.tape?.onlyGit, true);
    assert.deepEqual(settings.tape?.context?.memoryScan, [10, 10]);
    assert.deepEqual(settings.tape?.context?.whitelist, ['docs/tape-design.md', 'core/user/identity.md']);
    assert.deepEqual(settings.tape?.context?.blacklist, ['node_modules']);
    assert.equal(settings.tape?.anchor?.mode, 'auto');
    assert.deepEqual(settings.tape?.anchor?.keywords, { global: ['foo'], project: ['bar'] });
    assert.equal(settings.tape?.tapePath, undefined);
    assert.equal(core.getGlobalMemoryDir(settings), path.join(tempHome, 'global-memory', 'global'));
  } finally {
    homedirMock.mock.restore();
  }
});

test('memory file read-write-list-context-meta roundtrip works', async () => {
  const core = await import('../src/index.ts');
  const tempDir = createTempDir('pi-context-memory');
  const projectDir = path.join(tempDir, 'project-a');
  const settings = {
    localPath: path.join(tempDir, 'memory-root'),
    memoryDir: { globalMemory: 'global' },
  };

  initGitRepo(projectDir);

  const projectMemoryDir = core.getMemoryDir(settings, projectDir);
  const globalMemoryDir = core.getGlobalMemoryDir(settings);

  core.writeMemoryFile(path.join(projectMemoryDir, 'core', 'user', 'identity.md'), '# Identity\n\nHello', {
    description: 'User identity',
    tags: ['user', 'identity'],
    created: '2026-05-06',
  });
  core.writeMemoryFile(path.join(projectMemoryDir, 'core', 'project', 'roadmap.md'), '# Roadmap', {
    description: 'Project roadmap',
    tags: ['project'],
  });
  core.writeMemoryFile(path.join(projectMemoryDir, 'reference', 'ignore.md'), '# Ignore', {
    description: 'Should not be listed',
    tags: ['reference'],
  });
  core.writeMemoryFile(path.join(globalMemoryDir, 'USER.md'), '# Shared User', {
    description: 'Shared user profile',
    tags: ['global', 'user'],
  });

  const memory = await core.readMemoryFileAsync(path.join(projectMemoryDir, 'core', 'user', 'identity.md'));
  const files = await core.listMemoryFilesAsync(projectMemoryDir);
  const context = await core.buildMemoryContextAsync(settings, projectDir);
  const meta = await core.getMemoryMeta(settings, projectDir);

  assert.equal(memory?.frontmatter.description, 'User identity');
  assert.equal(memory?.content.trim(), '# Identity\n\nHello');
  assert.equal(files.length, 3);
  assert.equal(meta.initialized, true);
  assert.equal(meta.project.fileCount, 3);
  assert.equal(meta.global.fileCount, 1);
  assert.match(context, /<memory_context mode="normal">/);
  assert.match(context, /source="global"/);
  assert.match(context, /source="project"/);
  assert.match(context, /identity\.md/);
  assert.match(context, /roadmap\.md/);
  assert.doesNotMatch(context, /reference[\\/]ignore\.md/);
});

test('readMemoryFileAsync falls back for missing frontmatter and empty context returns empty string', async () => {
  const core = await import('../src/index.ts');
  const tempDir = createTempDir('pi-context-memory-fallback');
  const notePath = path.join(tempDir, 'note.md');
  const projectDir = path.join(tempDir, 'project-b');
  const settings = { localPath: path.join(tempDir, 'memory-root') };

  writeText(notePath, '# Plain note\n\nNo frontmatter here.');

  const memory = await core.readMemoryFileAsync(notePath);
  const context = await core.buildMemoryContextAsync(settings, projectDir);

  assert.equal(memory?.frontmatter.description, 'No description');
  assert.equal(context, '');
});
