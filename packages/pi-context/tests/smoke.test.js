import test from 'node:test';
import assert from 'node:assert/strict';

test('pi-context smoke scaffold', async () => {
  const mod = await import('../src/index.ts');
  assert.equal(mod.packageInfo.name, 'pi-context');
  assert.equal(mod.packageInfo.stage, 'adapter-shell');
  assert.ok(mod.bootstrap.bootstrapSurface);
  assert.ok(mod.hooks.hookSurface);
  assert.ok(mod.tools.toolSurface);
});
