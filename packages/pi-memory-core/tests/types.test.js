import test from 'node:test';
import assert from 'node:assert/strict';

test('pi-memory-core exports extracted type surface', async () => {
  const core = await import('../src/index.ts');

  assert.ok(core.memoryDeliveryModes);
  assert.deepEqual(core.memoryDeliveryModes, ['system-prompt', 'message-append']);

  assert.ok(core.defaultTapeConfig);
  assert.equal(core.defaultTapeConfig.context.strategy, 'smart');
  assert.equal(core.defaultTapeConfig.anchor.mode, 'auto');
});
