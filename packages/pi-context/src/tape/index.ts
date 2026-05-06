import crypto from 'node:crypto';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import {
  nowIso,
  resolveTapeGate,
  type KeywordHandoffInstruction,
  type MemoryMdSettings,
  type PendingHandoffMatch,
} from '@pi-context/pi-memory-core';
import { formatEntrySummary, scanEntries } from './reader.js';
import { getTapeAnchorStore, type TapeAnchor, type TapeAnchorMeta } from './store.js';

export const tapeSurface = {
  handoff: 'ported-minimal',
  list: 'ported-minimal',
  info: 'ported-minimal',
  delete: 'ported-minimal',
  search: 'ported-minimal',
  read: 'ported-minimal',
  reset: 'ported-minimal',
  sessionStart: 'ported-minimal',
} as const;

type PiLike = Pick<ExtensionAPI, 'registerTool'>;

type SessionReason = 'startup' | 'reload' | 'new' | 'resume' | 'fork';
type SessionLabelManager = {
  getLeafId?: () => string | null;
  getLabel?: (id: string) => string | undefined;
  labelsById?: Map<string, string>;
  labelTimestampsById?: Map<string, string>;
};

function textResult(text: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: 'text', text }],
    details,
  };
}

function normalizeKeywords(keywords?: string[]): string[] | undefined {
  if (!Array.isArray(keywords)) return undefined;
  const normalized = [...new Set(keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean))];
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeHandoffMeta(
  summary: string | undefined,
  purpose: string | undefined,
  trigger: 'direct' | 'keyword' | 'manual',
  keywords: string[] | undefined,
): TapeAnchorMeta {
  const meta: TapeAnchorMeta = { trigger };
  if (summary) meta.summary = summary;
  if (purpose) meta.purpose = purpose;
  const normalizedKeywords = normalizeKeywords(keywords);
  if (normalizedKeywords) meta.keywords = normalizedKeywords;
  return meta;
}

function consumeKeywordMatch(consumeHandoffMatch: () => PendingHandoffMatch): {
  handoffMatch: PendingHandoffMatch;
  keywordHandoffMatch: { trigger: 'keyword'; instruction: KeywordHandoffInstruction } | null;
} {
  const handoffMatch = consumeHandoffMatch();
  return {
    handoffMatch,
    keywordHandoffMatch: handoffMatch?.trigger === 'keyword' ? handoffMatch : null,
  };
}

function createAnchorRecord(
  name: string,
  type: 'handoff',
  sessionId: string | undefined,
  sessionEntryId: string | null | undefined,
  meta?: TapeAnchorMeta,
): TapeAnchor {
  return {
    id: crypto.randomUUID(),
    timestamp: nowIso(),
    name,
    type,
    sessionId: sessionId ?? 'unknown-session',
    sessionEntryId: sessionEntryId ?? crypto.randomUUID(),
    meta,
  };
}

function getSessionStartAnchorName(reason?: SessionReason): 'session/new' | 'session/resume' {
  return reason === 'new' || reason === 'startup' || reason === 'reload' || reason === 'fork' ? 'session/new' : 'session/resume';
}

function normalizeLabelPrefix(labelPrefix?: string): string {
  return labelPrefix && labelPrefix.trim() ? labelPrefix : '⚓ ';
}

function stripAnchorLabel(existingLabel: string | undefined, labelPrefix = '⚓ '): string | undefined {
  if (!existingLabel) return undefined;
  const marker = ` · ${labelPrefix}`;
  if (existingLabel.startsWith(labelPrefix)) return undefined;
  if (!existingLabel.includes(marker)) return existingLabel.trim() || undefined;
  const baseLabel = existingLabel.split(marker, 1)[0]?.trim();
  return baseLabel || undefined;
}

function mergeAnchorLabel(existingLabel: string | undefined, anchorName: string, labelPrefix = '⚓ '): string {
  const anchorLabel = `${labelPrefix}${anchorName}`;
  const baseLabel = stripAnchorLabel(existingLabel, labelPrefix);
  return baseLabel ? `${baseLabel} · ${anchorLabel}` : anchorLabel;
}

function setSessionTreeLabel(entryId: string, label: string | undefined, sessionManager: SessionLabelManager | undefined): void {
  if (!entryId || !sessionManager?.labelsById || !sessionManager?.labelTimestampsById) return;
  if (label) {
    sessionManager.labelsById.set(entryId, label);
    sessionManager.labelTimestampsById.set(entryId, nowIso());
    return;
  }
  sessionManager.labelsById.delete(entryId);
  sessionManager.labelTimestampsById.delete(entryId);
}

function syncSessionTreeLabel(anchorName: string, sessionManager: SessionLabelManager | undefined, labelPrefix?: string): void {
  const entryId = sessionManager?.getLeafId?.();
  if (!entryId) return;
  const prefix = normalizeLabelPrefix(labelPrefix);
  const nextLabel = mergeAnchorLabel(sessionManager?.getLabel?.(entryId), anchorName, prefix);
  setSessionTreeLabel(entryId, nextLabel, sessionManager);
}

function resyncEntryTreeLabel(
  entryId: string | null | undefined,
  sessionId: string | undefined,
  store: ReturnType<typeof getTapeAnchorStore>,
  sessionManager: SessionLabelManager | undefined,
  labelPrefix?: string,
): void {
  if (!entryId || !store || !sessionManager) return;
  const prefix = normalizeLabelPrefix(labelPrefix);
  const anchors = store.anchors.filter((anchor) => anchor.sessionId === sessionId && anchor.sessionEntryId === entryId);
  const nextAnchor = anchors.at(-1)?.name;
  const existingLabel = sessionManager.getLabel?.(entryId);
  const nextLabel = nextAnchor ? mergeAnchorLabel(existingLabel, nextAnchor, prefix) : stripAnchorLabel(existingLabel, prefix);
  setSessionTreeLabel(entryId, nextLabel, sessionManager);
}

function clearSessionTreeAnchorLabels(sessionManager: SessionLabelManager | undefined, labelPrefix?: string): void {
  const prefix = normalizeLabelPrefix(labelPrefix);
  for (const [entryId, existingLabel] of sessionManager?.labelsById ?? []) {
    const nextLabel = stripAnchorLabel(existingLabel, prefix);
    setSessionTreeLabel(entryId, nextLabel, sessionManager);
  }
}

function getStoreOrUnavailable(settings: MemoryMdSettings, cwd: string) {
  const store = getTapeAnchorStore(settings, cwd);
  if (store) return { store };

  const tapeGate = resolveTapeGate(cwd, settings.tape);
  const reason = settings.localPath ? tapeGate.reason : 'memory localPath is not configured';
  return {
    store: null,
    result: textResult(`Tape runtime is unavailable: ${reason}.`, { unavailable: true, reason }),
  };
}

export function registerTapeHandoff(
  pi: PiLike,
  settings: MemoryMdSettings,
  consumeHandoffMatch: () => PendingHandoffMatch = () => null,
): void {
  if (!settings.tape?.enabled) return;

  pi.registerTool({
    name: 'tape_handoff',
    description: 'Create a handoff anchor in tape',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Anchor name (e.g., 'task/begin', 'task/complete', 'handoff')" },
        summary: { type: 'string', description: 'Brief intent summary of current task (under 18 words)' },
        purpose: { type: 'string', description: "1-2 word label for the anchor's purpose" },
      },
      required: ['name'],
    },
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: { cwd: string; sessionManager?: SessionLabelManager & { getSessionId?: () => string; getLeafId?: () => string | null } }) {
      const { name, summary, purpose } = params as { name: string; summary?: string; purpose?: string };
      const { store, result } = getStoreOrUnavailable(settings, ctx.cwd);
      if (!store) return result;

      const { handoffMatch, keywordHandoffMatch } = consumeKeywordMatch(consumeHandoffMatch);
      const matchedKeywordHandoff = keywordHandoffMatch?.instruction.anchorName === name;
      const finalTrigger = handoffMatch?.trigger === 'manual' ? 'manual' : matchedKeywordHandoff ? 'keyword' : 'direct';
      const finalKeywords = finalTrigger === 'keyword' ? keywordHandoffMatch?.instruction.matched : undefined;
      const handoffMode = settings.tape?.anchor?.mode ?? 'auto';

      if (handoffMode === 'manual' && finalTrigger !== 'keyword' && finalTrigger !== 'manual') {
        return textResult(
          'tape_handoff is disabled when tape.anchor.mode="manual" unless a keyword or manual handoff match is present.',
          {
            disabled: true,
            handoffMode,
            allowedTriggers: ['keyword', 'manual'],
            finalTrigger,
            hasHandoffMatch: handoffMatch !== null,
            matchedKeywordHandoff: false,
          },
        );
      }

      const anchor = createAnchorRecord(
        name,
        'handoff',
        ctx.sessionManager?.getSessionId?.(),
        ctx.sessionManager?.getLeafId?.(),
        normalizeHandoffMeta(summary, purpose, finalTrigger, finalKeywords),
      );

      store.append(anchor);
      syncSessionTreeLabel(anchor.name, ctx.sessionManager, settings.tape?.anchor?.labelPrefix);
      return textResult(JSON.stringify(anchor), {
        anchorId: anchor.id,
        name,
        meta: { ...anchor.meta, timestamp: anchor.timestamp },
        finalTrigger,
        hasHandoffMatch: handoffMatch !== null,
        matchedKeywordHandoff: handoffMatch?.trigger === 'keyword' ? matchedKeywordHandoff : false,
      });
    },
  } as never);
}

export function registerTapeList(pi: PiLike, settings: MemoryMdSettings): void {
  if (!settings.tape?.enabled) return;

  pi.registerTool({
    name: 'tape_list',
    description: 'List tape anchors with nearby context',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        contextLines: { type: 'integer', minimum: 0, maximum: 5 },
      },
    },
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: { cwd: string }) {
      const { store, result } = getStoreOrUnavailable(settings, ctx.cwd);
      if (!store) return result;

      const { limit = 20 } = (params ?? {}) as { limit?: number; contextLines?: number };
      const anchors = store.list(limit);
      const summary = anchors.length === 0
        ? 'No anchors found in tape. Use tape_handoff to create an anchor.'
        : `Found ${anchors.length} anchor(s):\n\n${anchors.map((anchor) => `  - ${anchor.name} [${anchor.type}] (${anchor.timestamp})${anchor.meta ? `\n  Meta: ${JSON.stringify(anchor.meta)}` : ''}`).join('\n\n')}`;

      return textResult(summary, { anchors, count: anchors.length });
    },
  } as never);
}

export function registerTapeDelete(pi: PiLike, settings: MemoryMdSettings): void {
  if (!settings.tape?.enabled) return;

  pi.registerTool({
    name: 'tape_delete',
    description: 'Delete an anchor checkpoint by id',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: { cwd: string; sessionManager?: SessionLabelManager & { getSessionId?: () => string } }) {
      const { store, result } = getStoreOrUnavailable(settings, ctx.cwd);
      if (!store) return result;

      const { id } = params as { id: string };
      const removedAnchor = store.deleteById(id);
      if (!removedAnchor) {
        return textResult(`Anchor not found: ${id}`, { id, deleted: false });
      }

      resyncEntryTreeLabel(removedAnchor.sessionEntryId, removedAnchor.sessionId, store, ctx.sessionManager, settings.tape?.anchor?.labelPrefix);
      return textResult(JSON.stringify(removedAnchor), { id, deleted: true, name: removedAnchor.name });
    },
  } as never);
}

export function registerTapeInfo(pi: PiLike, settings: MemoryMdSettings): void {
  if (!settings.tape?.enabled) return;

  pi.registerTool({
    name: 'tape_info',
    description: 'Get tape summary and last-anchor info',
    parameters: { type: 'object', properties: {} },
    async execute(_toolCallId: string, _params: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: { cwd: string }) {
      const { store, result } = getStoreOrUnavailable(settings, ctx.cwd);
      if (!store) return result;

      const anchors = store.anchors;
      const lastAnchor = store.getLast();
      const summary = [
        '📊 Tape Information:',
        `  Total entries: ${anchors.length}`,
        `  Anchors: ${anchors.length}`,
        `  Last anchor: ${lastAnchor?.name ?? 'none'}`,
        `  Entries since last anchor: 0`,
      ].join('\n');

      return textResult(summary, {
        tapeFilePath: store.filePath,
        totalEntries: anchors.length,
        anchorCount: anchors.length,
        lastAnchorId: lastAnchor?.id ?? null,
        lastAnchorName: lastAnchor?.name ?? 'none',
        entriesSinceLastAnchor: 0,
      });
    },
  } as never);
}

export function registerTapeSearch(pi: PiLike, settings: MemoryMdSettings): void {
  if (!settings.tape?.enabled) return;

  pi.registerTool({
    name: 'tape_search',
    description: 'Search tape entries and anchors by type, content, or time range',
    parameters: {
      type: 'object',
      properties: {
        kinds: { type: 'array', items: { type: 'string' } },
        types: { type: 'array', items: { type: 'string' } },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        sinceAnchor: { type: 'string' },
        lastAnchor: { type: 'boolean' },
        betweenAnchors: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
        betweenDates: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
        entryScope: { enum: ['session', 'project'] },
        anchorScope: { enum: ['session', 'project'] },
        scan: { type: 'string' },
        anchorName: { type: 'string' },
        anchorType: { type: 'string' },
        anchorSummary: { type: 'string' },
        anchorPurpose: { type: 'string' },
        anchorKeywords: { type: 'array', items: { type: 'string' } },
      },
    },
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: { cwd: string; sessionManager?: { getSessionId?: () => string } }) {
      const { store, result } = getStoreOrUnavailable(settings, ctx.cwd);
      if (!store) return result;

      const {
        kinds = ['all'],
        types,
        limit = 20,
        sinceAnchor,
        lastAnchor,
        betweenAnchors,
        betweenDates,
        entryScope,
        anchorScope = 'session',
        scan,
        anchorName,
        anchorType,
        anchorSummary,
        anchorPurpose,
        anchorKeywords,
      } = (params ?? {}) as {
        kinds?: string[];
        types?: string[];
        limit?: number;
        sinceAnchor?: string;
        lastAnchor?: boolean;
        betweenAnchors?: { start: string; end: string };
        betweenDates?: { start: string; end: string };
        entryScope?: 'session' | 'project';
        anchorScope?: 'session' | 'project';
        scan?: string;
        anchorName?: string;
        anchorType?: string;
        anchorSummary?: string;
        anchorPurpose?: string;
        anchorKeywords?: string[];
      };

      const sessionId = ctx.sessionManager?.getSessionId?.();
      let anchorResults: TapeAnchor[] = [];
      let entryResults: ReturnType<typeof scanEntries> = [];

      if (kinds.includes('anchor') || kinds.includes('all')) {
        const filtered = store.anchors.filter((anchor) => {
          if (anchorScope !== 'project' && sessionId && anchor.sessionId !== sessionId) return false;
          if (anchorName && !anchor.name.toLowerCase().includes(anchorName.toLowerCase())) return false;
          if (anchorType && anchor.type !== anchorType) return false;
          if (anchorSummary && !String(anchor.meta?.summary ?? '').toLowerCase().includes(anchorSummary.toLowerCase())) return false;
          if (anchorPurpose && !String(anchor.meta?.purpose ?? '').toLowerCase().includes(anchorPurpose.toLowerCase())) return false;
          if (anchorKeywords?.length) {
            const keywords = anchor.meta?.keywords?.map((keyword) => keyword.toLowerCase()) ?? [];
            if (!anchorKeywords.every((keyword) => keywords.includes(keyword.toLowerCase()))) return false;
          }
          if (scan) {
            const haystack = `${anchor.name} ${JSON.stringify(anchor.meta ?? {})}`.toLowerCase();
            if (!haystack.includes(scan.toLowerCase())) return false;
          }
          return true;
        });
        anchorResults = filtered.slice(-limit);
      }

      if (kinds.includes('entry') || kinds.includes('all')) {
        entryResults = scanEntries(ctx.cwd, sessionId, store.anchors, {
          types: types as never,
          limit,
          scan,
          sinceAnchor,
          lastAnchor,
          betweenAnchors,
          betweenDates,
          entryScope: entryScope ?? (anchorScope === 'session' ? 'session' : 'project'),
          anchorScope,
        });
      }

      const parts: string[] = [];
      const lines: string[] = [];
      if (anchorResults.length > 0) {
        parts.push(`${anchorResults.length} anchors`);
        lines.push('Anchors:');
        for (const anchor of anchorResults) {
          lines.push(`  ${anchor.name} [${anchor.type}] (${anchor.timestamp})${anchor.meta ? ` ${JSON.stringify(anchor.meta)}` : ''}`);
        }
      }
      if (entryResults.length > 0) {
        parts.push(`${entryResults.length} entries`);
        lines.push('Entries:');
        for (const entry of entryResults) {
          lines.push(formatEntrySummary(entry));
        }
      }
      const header = parts.length > 0 ? `Found ${parts.join(', ')}` : 'No results';
      return textResult(`${header}\n\n${lines.join('\n') || '(no results)'}`, {
        kinds,
        scan,
        count: anchorResults.length + entryResults.length,
        anchorCount: anchorResults.length,
        entryCount: entryResults.length,
      });
    },
  } as never);
}

export function registerTapeRead(pi: PiLike, settings: MemoryMdSettings): void {
  if (!settings.tape?.enabled) return;

  pi.registerTool({
    name: 'tape_read',
    description: 'Read tape entries from pi session with anchor, date, or scan filters.',
    parameters: {
      type: 'object',
      properties: {
        afterAnchor: { type: 'string' },
        lastAnchor: { type: 'boolean' },
        betweenAnchors: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
        betweenDates: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
        scan: { type: 'string' },
        types: { type: 'array', items: { type: 'string' } },
        entryScope: { enum: ['session', 'project'] },
        anchorScope: { enum: ['session', 'project'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: { cwd: string; sessionManager?: { getSessionId?: () => string } }) {
      const { store, result } = getStoreOrUnavailable(settings, ctx.cwd);
      if (!store) return result;

      const {
        afterAnchor,
        betweenAnchors,
        betweenDates,
        types,
        lastAnchor = false,
        entryScope = 'project',
        anchorScope = 'session',
        limit = 20,
        scan,
      } = (params ?? {}) as {
        afterAnchor?: string;
        betweenAnchors?: { start: string; end: string };
        betweenDates?: { start: string; end: string };
        types?: string[];
        lastAnchor?: boolean;
        entryScope?: 'session' | 'project';
        anchorScope?: 'session' | 'project';
        limit?: number;
        scan?: string;
      };

      const entries = scanEntries(ctx.cwd, ctx.sessionManager?.getSessionId?.(), store.anchors, {
        types: types as never,
        limit,
        entryScope,
        anchorScope,
        scan,
        sinceAnchor: afterAnchor,
        lastAnchor,
        betweenAnchors,
        betweenDates,
      });
      return textResult(`Retrieved ${entries.length} entries:\n\n${entries.map(formatEntrySummary).join('\n') || '(no entries)'}`, {
        entries,
        count: entries.length,
      });
    },
  } as never);
}

export function registerTapeReset(pi: PiLike, settings: MemoryMdSettings): void {
  if (!settings.tape?.enabled) return;

  pi.registerTool({
    name: 'tape_reset',
    description: 'Clear tape anchors and create a fresh session anchor',
    parameters: {
      type: 'object',
      properties: {
        archive: { type: 'boolean' },
      },
    },
    async execute(_toolCallId: string, _params: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: { cwd: string; sessionManager?: SessionLabelManager & { getSessionId?: () => string; getLeafId?: () => string | null } }) {
      const { store, result } = getStoreOrUnavailable(settings, ctx.cwd);
      if (!store) return result;

      const clearedCount = store.anchors.length;
      clearSessionTreeAnchorLabels(ctx.sessionManager, settings.tape?.anchor?.labelPrefix);
      const anchor = createAnchorRecord('session/new', 'handoff', ctx.sessionManager?.getSessionId?.(), ctx.sessionManager?.getLeafId?.(), { trigger: 'direct' });
      store.replaceAll([anchor]);
      syncSessionTreeLabel(anchor.name, ctx.sessionManager, settings.tape?.anchor?.labelPrefix);
      return textResult(`Tape reset complete. Created fresh anchor ${anchor.name}.`, {
        clearedCount,
        anchorCount: 1,
        lastAnchorId: anchor.id,
        lastAnchorName: anchor.name,
      });
    },
  } as never);
}

export function recordSessionStartAnchor(
  settings: MemoryMdSettings,
  cwd: string,
  reason: SessionReason | undefined,
  session: { sessionId?: string; sessionEntryId?: string | null; sessionManager?: SessionLabelManager },
): TapeAnchor | null {
  const store = getTapeAnchorStore(settings, cwd);
  if (!store) return null;
  const anchor = createAnchorRecord(getSessionStartAnchorName(reason), 'handoff', session.sessionId, session.sessionEntryId, { trigger: 'direct' });
  store.append(anchor);
  syncSessionTreeLabel(anchor.name, session.sessionManager, settings.tape?.anchor?.labelPrefix);
  return anchor;
}

export function registerAllTapeTools(
  pi: PiLike,
  settings: MemoryMdSettings,
  consumeHandoffMatch: () => PendingHandoffMatch = () => null,
): void {
  registerTapeHandoff(pi, settings, consumeHandoffMatch);
  registerTapeList(pi, settings);
  registerTapeDelete(pi, settings);
  registerTapeInfo(pi, settings);
  registerTapeSearch(pi, settings);
  registerTapeRead(pi, settings);
  registerTapeReset(pi, settings);
}
