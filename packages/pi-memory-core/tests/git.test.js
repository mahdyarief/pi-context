import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, initGitRepo } from './test-helpers.js';

test('git client exports support injected exec, sync, and push flows', async () => {
  const core = await import('../src/index.ts');
  assert.equal(typeof core.gitExec, 'function');
  assert.equal(typeof core.syncRepository, 'function');
  assert.equal(typeof core.pushRepository, 'function');
  assert.equal(typeof core.getRepoName, 'function');
});

test('gitExec returns stdout on success', async () => {
  const core = await import('../src/index.ts');
  const calls = [];
  const result = await core.gitExec(async (command, args, options) => {
    calls.push({ command, args, options });
    return { stdout: 'ok\n' };
  }, '/tmp/project', ['status']);

  assert.deepEqual(result, { stdout: 'ok\n', success: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.args, ['status']);
});

test('gitExec returns failure for normal exec errors', async () => {
  const core = await import('../src/index.ts');
  const result = await core.gitExec(async () => {
    throw new Error('boom');
  }, '/tmp/project', ['status']);

  assert.equal(result.success, false);
  assert.equal(result.timeout, undefined);
  assert.match(result.stdout, /boom/);
});

test('gitExec marks abort errors as timeout', async () => {
  const core = await import('../src/index.ts');
  const result = await core.gitExec(async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  }, '/tmp/project', ['status']);

  assert.deepEqual(result, { stdout: '', success: false, timeout: true });
});

test('syncRepository fails when repoUrl is missing', async () => {
  const core = await import('../src/index.ts');
  const result = await core.syncRepository(async () => ({ stdout: 'unused' }), { localPath: '/tmp/memory' });
  assert.deepEqual(result, {
    success: false,
    message: 'Git repository URL or local path not configured',
  });
});

test('syncRepository fails when local directory exists but is not a git repo', async () => {
  const core = await import('../src/index.ts');
  const localPath = createTempDir('pi-context-sync-no-git');
  const result = await core.syncRepository(async () => ({ stdout: 'unused' }), {
    localPath,
    repoUrl: 'https://github.com/acme/memory.git',
  });

  assert.deepEqual(result, {
    success: false,
    message: `Directory exists but is not a git repo: ${localPath}`,
  });
});

test('syncRepository returns already latest when there are no upstream commits to pull', async () => {
  const core = await import('../src/index.ts');
  const localPath = createTempDir('pi-context-sync-latest');
  initGitRepo(localPath);
  const calls = [];
  const exec = async (_command, args) => {
    const command = args.join(' ');
    calls.push(command);
    if (command === 'rev-parse --git-path FETCH_HEAD') return { stdout: '.git/FETCH_HEAD\n' };
    if (command === 'fetch') return { stdout: '' };
    if (command === 'rev-parse --abbrev-ref @{u}') return { stdout: 'origin/main\n' };
    if (command === 'rev-list --count HEAD..@{u}') return { stdout: '0\n' };
    throw new Error(`Unexpected command: ${command}`);
  };

  const result = await core.syncRepository(exec, {
    localPath,
    repoUrl: 'https://github.com/acme/memory.git',
  });

  assert.deepEqual(result, {
    success: true,
    message: '[memory] is already latest',
    updated: false,
  });
  assert.deepEqual(calls, ['rev-parse --git-path FETCH_HEAD', 'fetch', 'rev-parse --abbrev-ref @{u}', 'rev-list --count HEAD..@{u}']);
});

test('syncRepository skips fetch when FETCH_HEAD is fresh', async () => {
  const core = await import('../src/index.ts');
  const localPath = createTempDir('pi-context-sync-fresh-fetch-head');
  initGitRepo(localPath);
  fs.writeFileSync(path.join(localPath, '.git', 'FETCH_HEAD'), 'fresh\n');

  const calls = [];
  const result = await core.syncRepository(async (_command, args) => {
    const command = args.join(' ');
    calls.push(command);
    if (command === 'rev-parse --git-path FETCH_HEAD') return { stdout: '.git/FETCH_HEAD\n' };
    if (command === 'rev-parse --abbrev-ref @{u}') return { stdout: 'origin/main\n' };
    if (command === 'rev-list --count HEAD..@{u}') return { stdout: '0\n' };
    throw new Error(`Unexpected command: ${command}`);
  }, {
    localPath,
    repoUrl: 'https://github.com/acme/memory.git',
  });

  assert.deepEqual(result, {
    success: true,
    message: '[memory] is already latest',
    updated: false,
  });
  assert.equal(calls.includes('fetch'), false);
});

test('syncRepository pulls only when upstream has commits', async () => {
  const core = await import('../src/index.ts');
  const localPath = createTempDir('pi-context-sync-behind');
  initGitRepo(localPath);
  let behindChecks = 0;

  const result = await core.syncRepository(async (_command, args) => {
    const command = args.join(' ');
    if (command === 'rev-parse --git-path FETCH_HEAD') return { stdout: '.git/FETCH_HEAD\n' };
    if (command === 'fetch') return { stdout: '' };
    if (command === 'rev-parse --abbrev-ref @{u}') return { stdout: 'origin/main\n' };
    if (command === 'rev-list --count HEAD..@{u}') {
      behindChecks += 1;
      return { stdout: behindChecks === 1 ? '2\n' : '0\n' };
    }
    if (command === 'rebase --autostash @{u}') return { stdout: 'Successfully rebased\n' };
    throw new Error(`Unexpected command: ${command}`);
  }, {
    localPath,
    repoUrl: 'https://github.com/acme/memory.git',
  });

  assert.deepEqual(result, {
    success: true,
    message: 'Pulled latest changes from [memory]',
    updated: true,
  });
});

test('syncRepository fails when pull leaves repository behind', async () => {
  const core = await import('../src/index.ts');
  const localPath = createTempDir('pi-context-sync-still-behind');
  initGitRepo(localPath);

  const result = await core.syncRepository(async (_command, args) => {
    const command = args.join(' ');
    if (command === 'rev-parse --git-path FETCH_HEAD') return { stdout: '.git/FETCH_HEAD\n' };
    if (command === 'fetch') return { stdout: '' };
    if (command === 'rev-parse --abbrev-ref @{u}') return { stdout: 'origin/main\n' };
    if (command === 'rev-list --count HEAD..@{u}') return { stdout: '1\n' };
    if (command === 'rebase --autostash @{u}') return { stdout: 'Already up to date.\n' };
    throw new Error(`Unexpected command: ${command}`);
  }, {
    localPath,
    repoUrl: 'https://github.com/acme/memory.git',
  });

  assert.deepEqual(result, {
    success: false,
    message: 'Pull did not update [memory], still behind by 1 commit(s). Please resolve these git issues manually.',
    level: 'warning',
  });
});

test('syncRepository clones repository when local path does not exist', async () => {
  const core = await import('../src/index.ts');
  const rootDir = createTempDir('pi-context-sync-clone');
  const localPath = path.join(rootDir, 'memory-repo');
  const calls = [];

  const result = await core.syncRepository(async (_command, args) => {
    calls.push(args);
    if (args[0] === 'clone') return { stdout: 'cloned' };
    throw new Error(`Unexpected command: ${args.join(' ')}`);
  }, {
    localPath,
    repoUrl: 'https://github.com/acme/memory.git',
  });

  assert.deepEqual(result, {
    success: true,
    message: 'Cloned [memory] successfully',
    updated: true,
  });
  assert.equal(fs.existsSync(localPath), true);
  assert.deepEqual(calls[0], ['clone', 'https://github.com/acme/memory.git', 'memory-repo']);
});

test('pushRepository fails when git repository is not initialized', async () => {
  const core = await import('../src/index.ts');
  const localPath = createTempDir('pi-context-push-no-git');
  const result = await core.pushRepository(async () => ({ stdout: 'unused' }), {
    localPath,
    repoUrl: 'https://github.com/acme/memory.git',
  });

  assert.deepEqual(result, {
    success: false,
    message: `Git repository not initialized: ${localPath}`,
  });
});

test('pushRepository returns no memory changes when there is nothing to push', async () => {
  const core = await import('../src/index.ts');
  const localPath = createTempDir('pi-context-push-clean');
  initGitRepo(localPath);

  const result = await core.pushRepository(async (_command, args) => {
    const command = args.join(' ');
    if (command === 'status --porcelain') return { stdout: '' };
    if (command === 'rev-parse --abbrev-ref @{u}') return { stdout: 'origin/main\n' };
    if (command === 'rev-list --count @{u}..HEAD') return { stdout: '0\n' };
    throw new Error(`Unexpected command: ${command}`);
  }, {
    localPath,
    repoUrl: 'https://github.com/acme/memory.git',
  });

  assert.deepEqual(result, {
    success: true,
    message: '[memory] has no memory changes to push',
    updated: false,
  });
});

test('pushRepository adds commits and pushes when there are local changes', async () => {
  const core = await import('../src/index.ts');
  const localPath = createTempDir('pi-context-push-dirty');
  initGitRepo(localPath);
  const calls = [];

  const result = await core.pushRepository(async (_command, args) => {
    const command = args.join(' ');
    calls.push(args[0]);
    if (command === 'status --porcelain') return { stdout: ' M core/user/identity.md\n' };
    if (command === 'add .') return { stdout: '' };
    if (args[0] === 'commit' && args[1] === '-m') return { stdout: '[main abc123] Update memory\n' };
    if (command === 'push') return { stdout: 'done' };
    throw new Error(`Unexpected command: ${command}`);
  }, {
    localPath,
    repoUrl: 'https://github.com/acme/memory.git',
  });

  assert.deepEqual(result, {
    success: true,
    message: '[memory] pushed memory changes',
    updated: true,
  });
  assert.deepEqual(calls, ['status', 'add', 'commit', 'push']);
});
