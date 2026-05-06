import test from 'node:test';
import assert from 'node:assert/strict';

test('pi-memory-core smoke scaffold', async () => {
  const core = await import('../src/index.ts');
  assert.equal(core.packageInfo.name, '@pi-context/pi-memory-core');
  assert.equal(core.packageInfo.stage, 'scaffold');
  assert.ok(core.config.defaultCoreConfig);
  assert.ok(core.models.memoryDocumentKinds);
});
