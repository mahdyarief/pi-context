import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
} from '@mariozechner/pi-coding-agent';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildMemoryContextAsync,
  countMemoryContextFiles,
  detectKeywordHandoff,
  formatMemoryContext,
  getHookActions,
  getMemoryCoreDir,
  getMemoryDir,
  loadSettings,
  normalizeHooks,
  pushRepository,
  resolveTapeGate,
  runHookTrigger,
  shouldBlockTapeHandoffCall,
  syncRepository,
  type HookAction,
  type MemoryMdSettings,
  type PendingHandoffMatch,
} from '@pi-context/pi-memory-core';
import { registerAllMemoryTools } from '../tools/index.js';
import { buildTapeContextAsync } from '../tape/context.js';
import { recordSessionStartAnchor, registerAllTapeTools } from '../tape/index.js';
import { buildMemoryCheckNotifications, MISSING_REPO_URL_MESSAGE } from '../commands/memory-check.js';
import { buildMemoryReviewSummary, DEFAULT_MEMORY_REVIEW_LIMIT, normalizeMemoryReviewLimit } from '../commands/memory-review.js';

export type PiLike = Pick<ExtensionAPI, 'on' | 'registerCommand' | 'registerTool' | 'sendMessage' | 'exec'>;

export const bootstrapSurface = {
  runtime: 'pi',
  stage: 'adapter-shell',
} as const;

type CachedContext = {
  content: string;
  fileCount: number;
};

type AdapterState = {
  initialMemoryContext: CachedContext | null;
  initialTapeContext: CachedContext | null;
  hasDeliveredInitialContext: boolean;
  pendingHandoffMatch: PendingHandoffMatch;
  sessionStartHookPromise: Promise<Array<{ action: HookAction; result: { success: boolean; message: string; updated?: boolean; level?: 'info' | 'warning' | 'error' } }>> | null;
};

function createAdapterState(): AdapterState {
  return {
    initialMemoryContext: null,
    initialTapeContext: null,
    hasDeliveredInitialContext: false,
    pendingHandoffMatch: null,
    sessionStartHookPromise: null,
  };
}

async function cacheInitialContext(settings: MemoryMdSettings, state: AdapterState, cwd: string): Promise<void> {
  const tapeGate = resolveTapeGate(cwd, settings.tape);
  state.initialTapeContext = tapeGate.enabled ? await buildTapeContextAsync(settings, cwd) : null;

  if (!settings.enabled) {
    state.initialMemoryContext = null;
    return;
  }

  const baseMemoryContext = await buildMemoryContextAsync(settings, cwd);
  state.initialMemoryContext = baseMemoryContext
    ? {
        content: formatMemoryContext(baseMemoryContext),
        fileCount: countMemoryContextFiles(baseMemoryContext),
      }
    : null;
}

async function runHookAction(pi: PiLike, settings: MemoryMdSettings, action: HookAction) {
  const exec = (command: string, args: string[], options?: { cwd?: string; signal?: AbortSignal }) => pi.exec(command, args, options);
  switch (action) {
    case 'pull':
      return syncRepository(exec, settings);
    case 'push':
      return pushRepository(exec, settings);
    default:
      return { success: false, message: `Unsupported hook action: ${action}` };
  }
}

function notifyHookResults(
  ctx: ExtensionContext,
  settings: MemoryMdSettings,
  phase: 'sessionStart' | 'sessionEnd',
  results: Awaited<ReturnType<typeof runHookTrigger>>,
): void {
  if (!settings.repoUrl) return;
  const label = phase === 'sessionStart' ? 'start' : 'end';
  for (const { action, result } of results) {
    if (result.success && !result.updated) continue;
    ctx.ui.notify(`${result.message} (${label}/${action})`, result.level ?? (result.success ? 'info' : 'error'));
  }
}

function runHookTriggerWithNotify(pi: PiLike, settings: MemoryMdSettings, ctx: ExtensionContext, phase: 'sessionStart' | 'sessionEnd') {
  return runHookTrigger(settings, phase, (action) => runHookAction(pi, settings, action)).then((results) => {
    notifyHookResults(ctx, settings, phase, results);
    return results;
  });
}

function queueKeywordHandoffMessage(pi: PiLike, keywordHandoff: ReturnType<typeof detectKeywordHandoff>): void {
  if (!keywordHandoff) return;

  pi.sendMessage(
    {
      customType: 'pi-context-tape-keyword',
      content: keywordHandoff.message,
      display: false,
    },
    { triggerTurn: false },
  );
}

async function handleBeforeAgentStart(
  pi: PiLike,
  settings: MemoryMdSettings,
  state: AdapterState,
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
): Promise<BeforeAgentStartEventResult | undefined> {
  const memoryDir = settings.localPath ? getMemoryDir(settings, ctx.cwd) : path.join(ctx.cwd, '.pi-context-memory');
  if (!settings.repoUrl?.trim() && !fs.existsSync(getMemoryCoreDir(memoryDir))) {
    ctx.ui.notify(MISSING_REPO_URL_MESSAGE, 'warning');
    return undefined;
  }

  if (state.sessionStartHookPromise) {
    await state.sessionStartHookPromise;
    state.sessionStartHookPromise = null;
  }

  const tapeGate = resolveTapeGate(ctx.cwd, settings.tape);
  const keywordHandoff = tapeGate.enabled ? detectKeywordHandoff(event.prompt, settings.tape?.anchor?.keywords) : null;

  if (state.pendingHandoffMatch?.trigger !== 'manual') {
    state.pendingHandoffMatch = keywordHandoff ? { trigger: 'keyword', instruction: keywordHandoff } : null;
  }

  if (keywordHandoff) {
    ctx.ui.notify(`Tape keyword detected: ${keywordHandoff.primary}`, 'info');
  }

  queueKeywordHandoffMessage(pi, keywordHandoff);

  if (!state.initialMemoryContext && !state.initialTapeContext) {
    await cacheInitialContext(settings, state, ctx.cwd);
  }

  const mode = settings.delivery ?? settings.injection ?? 'message-append';
  const shouldDeliverInitialContext = mode === 'system-prompt' || !state.hasDeliveredInitialContext;

  if (!shouldDeliverInitialContext) {
    return undefined;
  }

  if (tapeGate.enabled && state.initialTapeContext) {
    const { content, fileCount } = state.initialTapeContext;
    ctx.ui.notify(`Tape mode: ${fileCount} memory files delivered (${mode})`, 'info');

    if (mode === 'system-prompt') {
      return { systemPrompt: `${event.systemPrompt}\n\n${content}` };
    }

    state.hasDeliveredInitialContext = true;
    return { message: { customType: 'pi-context-tape', content, display: false } };
  }

  if (tapeGate.enabled && !state.initialTapeContext) {
    return undefined;
  }

  if (!state.initialMemoryContext) {
    return undefined;
  }

  const { content, fileCount } = state.initialMemoryContext;
  ctx.ui.notify(`Memory delivered: ${fileCount} files (${mode})`, 'info');

  if (mode === 'system-prompt') {
    return { systemPrompt: `${event.systemPrompt}\n\n${content}` };
  }

  state.hasDeliveredInitialContext = true;
  return { message: { customType: 'pi-context-memory', content, display: false } };
}

function buildManualAnchorMessage(prompt: string): string {
  return [
    'The user explicitly requested a manual tape anchor via /memory-anchor.',
    '',
    'Before continuing, call tape_handoff with:',
    '- name: "<hierarchical anchor name derived from the user request>"',
    '- summary: "<brief intent summary in the user\'s language, under 18 words>"',
    '- purpose: "<1-2 word label>"',
    '',
    'Constraints:',
    '- Derive the anchor fields from the user prompt below.',
    '- Keep the name concrete and reusable.',
    '- Do not ask follow-up questions.',
    '- After creating the anchor, continue normally.',
    '',
    `User prompt: ${prompt}`,
  ].join('\n');
}

function registerMemoryCommands(pi: PiLike, settings: MemoryMdSettings, state: AdapterState): void {
  pi.registerCommand('memory-refresh', {
    description: 'Refresh memory context from files',
    handler: async (_args: string, ctx: ExtensionContext) => {
      await cacheInitialContext(settings, state, ctx.cwd);

      if (!state.initialMemoryContext) {
        ctx.ui.notify('No memory files found to refresh', 'warning');
        return;
      }

      state.hasDeliveredInitialContext = false;
      const mode = settings.delivery ?? settings.injection ?? 'message-append';
      const { content, fileCount } = state.initialMemoryContext;

      if (mode === 'message-append') {
        pi.sendMessage({
          customType: 'pi-context-memory-refresh',
          content,
          display: false,
        });
        ctx.ui.notify(`Memory refreshed: ${fileCount} files delivered (${mode})`, 'info');
        return;
      }

      ctx.ui.notify(`Memory cache refreshed: ${fileCount} files (will be delivered on next prompt)`, 'info');
    },
  });

  pi.registerCommand('memory-check', {
    description: 'Check memory repository status and folder structure',
    handler: async (args: string, ctx: ExtensionContext) => {
      const exec = (command: string, commandArgs: string[], options?: { cwd?: string; signal?: AbortSignal }) => pi.exec(command, commandArgs, options);
      const notifications = await buildMemoryCheckNotifications(settings, ctx.cwd, exec, args);
      for (const notification of notifications) {
        ctx.ui.notify(notification.message, notification.level);
      }
    },
  });

  if (settings.tape?.enabled) {
    pi.registerCommand('memory-review', {
      description: 'Show a Memory Review summary for recent tape anchors',
      handler: async (args: string, ctx: ExtensionContext) => {
        const requestedLimit = Number.parseInt(args.trim(), 10);
        const limit = normalizeMemoryReviewLimit(Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_MEMORY_REVIEW_LIMIT);
        const summary = buildMemoryReviewSummary(settings, ctx.cwd, ctx.sessionManager?.getSessionId?.(), limit);
        ctx.ui.notify(summary, summary === 'Tape runtime is unavailable.' ? 'error' : 'info');
      },
    });

    pi.registerCommand('memory-anchor', {
      description: 'Ask the LLM to create a manual tape anchor from your prompt',
      handler: async (args: string, ctx: ExtensionContext) => {
        const prompt = args.trim();
        if (!prompt) {
          ctx.ui.notify('Usage: /memory-anchor <prompt>', 'warning');
          return;
        }

        state.pendingHandoffMatch = { trigger: 'manual' };
        pi.sendMessage(
          {
            customType: 'pi-context-tape-manual-anchor',
            content: buildManualAnchorMessage(prompt),
            display: false,
          },
          { triggerTurn: true },
        );
        ctx.ui.notify('Manual anchor request queued', 'info');
      },
    });
  }
}

export function registerAdapterShell(pi: PiLike, settings = loadSettings()): void {
  const normalizedSettings: MemoryMdSettings = {
    ...settings,
    hooks: normalizeHooks(settings.hooks),
  };
  const state = createAdapterState();

  (pi as { on(name: string, handler: (event: { toolName: string; input?: { name?: unknown } }) => Promise<{ block: true; reason: string } | undefined>): void }).on(
    'tool_call',
    async (event: { toolName: string; input?: { name?: unknown } }) => {
      if (event.toolName !== 'tape_handoff') return;

      const reason = shouldBlockTapeHandoffCall(normalizedSettings, state, event.input?.name);
      if (!reason) return;

      return { block: true, reason };
    },
  );

  pi.on('before_agent_start', async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    return handleBeforeAgentStart(pi, normalizedSettings, state, event, ctx);
  });

  pi.on('session_start', async (event: { reason?: 'startup' | 'reload' | 'new' | 'resume' | 'fork'; previousSessionFile?: string }, ctx: ExtensionContext) => {
    state.hasDeliveredInitialContext = false;

    recordSessionStartAnchor(normalizedSettings, ctx.cwd, event.reason, {
      sessionId: ctx.sessionManager?.getSessionId?.(),
      sessionEntryId: ctx.sessionManager?.getLeafId?.(),
      sessionManager: ctx.sessionManager,
    });

    const shouldRunHooks = !(event.previousSessionFile && (event.reason === 'new' || event.reason === 'fork'));
    if (shouldRunHooks && normalizedSettings.localPath && getHookActions(normalizedSettings, 'sessionStart').length > 0) {
      state.sessionStartHookPromise = runHookTriggerWithNotify(pi, normalizedSettings, ctx, 'sessionStart');
    } else {
      state.sessionStartHookPromise = null;
    }
  });

  pi.on('session_shutdown', async (_event: unknown, ctx: ExtensionContext) => {
    if (getHookActions(normalizedSettings, 'sessionEnd').length === 0 || !normalizedSettings.localPath) {
      return;
    }

    const memoryDir = getMemoryDir(normalizedSettings, ctx.cwd);
    if (!fs.existsSync(getMemoryCoreDir(memoryDir))) {
      return;
    }

    await runHookTriggerWithNotify(pi, normalizedSettings, ctx, 'sessionEnd');
  });

  registerAllMemoryTools(pi, normalizedSettings);
  registerAllTapeTools(pi, normalizedSettings, () => {
    const handoffMatch = state.pendingHandoffMatch;
    state.pendingHandoffMatch = null;
    return handoffMatch;
  });
  registerMemoryCommands(pi, normalizedSettings, state);
}
