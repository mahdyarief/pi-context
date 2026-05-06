import test from 'node:test';
import assert from 'node:assert/strict';

test('hook helpers normalize legacy config and execute resolved actions', async () => {
  const core = await import('../src/index.ts');

  assert.deepEqual(core.normalizeHooks(undefined), {
    sessionStart: ['pull'],
    sessionEnd: [],
  });

  assert.deepEqual(core.normalizeHooks({ onSessionStart: false }), {
    sessionStart: [],
    sessionEnd: [],
  });

  assert.deepEqual(core.normalizeHooks({ sessionStart: ['push', '', 'pull'], sessionEnd: ['push'] }), {
    sessionStart: ['push', 'pull'],
    sessionEnd: ['push'],
  });

  const settings = { hooks: { sessionEnd: ['push'] } };
  assert.deepEqual(core.getHookActions(settings, 'sessionStart'), ['pull']);
  assert.deepEqual(core.getHookActions(settings, 'sessionEnd'), ['push']);

  const seen = [];
  const results = await core.runHookTrigger(settings, 'sessionEnd', async (action) => {
    seen.push(action);
    return { success: true, message: action };
  });

  assert.deepEqual(seen, ['push']);
  assert.deepEqual(results, [{ action: 'push', result: { success: true, message: 'push' } }]);
});
