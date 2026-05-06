import type { HookAction, HookConfig, HookTrigger, MemoryMdSettings, SyncResult } from '../types.js';
import { DEFAULT_HOOKS } from '../config/settings.js';

export function getHookActions(settings: MemoryMdSettings, trigger: HookTrigger): HookAction[] {
  return settings.hooks?.[trigger] ?? DEFAULT_HOOKS[trigger];
}

export async function runHookTrigger(
  settings: MemoryMdSettings,
  trigger: HookTrigger,
  runHookAction: (action: HookAction) => Promise<SyncResult>,
): Promise<Array<{ action: HookAction; result: SyncResult }>> {
  const actions = getHookActions(settings, trigger);
  const results: Array<{ action: HookAction; result: SyncResult }> = [];

  for (const action of actions) {
    results.push({ action, result: await runHookAction(action) });
  }

  return results;
}
