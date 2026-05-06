import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const cwd = process.cwd();

test('pi-memory-core exports extracted utility helpers', async () => {
  const core = await import('../src/index.ts');

  assert.equal(core.expandHomePath('~/memory'), path.join(os.homedir(), '/memory'));
  assert.equal(core.resolvePathWithin('/tmp/base', '../escape'), null);
  assert.equal(core.isPathInside('/tmp/base', '/tmp/base/file.txt'), true);
  assert.equal(core.toRelativeIfInside('/tmp/base', '/tmp/base/note.md'), 'note.md');
  assert.equal(core.getTapeBasePath('/repo/memory'), path.join('/repo/memory', 'TAPE'));

  const meta = core.getProjectMeta(cwd);
  assert.equal(meta.cwd, path.resolve(cwd));
  assert.equal(typeof meta.name, 'string');
  assert.equal(typeof meta.isWorktree, 'boolean');
});
