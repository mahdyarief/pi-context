import { resolveTapeGate, type MemoryMdSettings } from '@pi-context/pi-memory-core';
import { getTapeAnchorStore } from '../tape/store.js';

export const DEFAULT_MEMORY_REVIEW_LIMIT = 50;
const MAX_MEMORY_REVIEW_LIMIT = 100;

export function normalizeMemoryReviewLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_MEMORY_REVIEW_LIMIT;
  return Math.min(Math.floor(limit), MAX_MEMORY_REVIEW_LIMIT);
}

export function buildMemoryReviewSummary(
  settings: MemoryMdSettings,
  cwd: string,
  sessionId: string | undefined,
  limit: number,
): string {
  const tapeGate = resolveTapeGate(cwd, settings.tape);
  if (!tapeGate.enabled) return 'Tape runtime is unavailable.';

  const store = getTapeAnchorStore(settings, cwd);
  if (!store) return 'Tape runtime is unavailable.';

  const normalizedLimit = normalizeMemoryReviewLimit(limit);
  const allScopedAnchors = store.anchors.filter(
    (anchor) => (!sessionId || anchor.sessionId === sessionId) && !anchor.name.startsWith('session/'),
  );
  const anchors = allScopedAnchors.slice(-normalizedLimit);
  const triggerCounts = new Map<string, number>();
  for (const anchor of anchors) {
    const trigger = String(anchor.meta?.trigger ?? 'unset');
    triggerCounts.set(trigger, (triggerCounts.get(trigger) ?? 0) + 1);
  }

  const triggerSummary = [...triggerCounts.entries()].map(([name, count]) => `${name}:${count}`).join(', ') || 'none';
  const lines = [
    'Memory Review Summary',
    'Scope: session',
    `Anchors: ${allScopedAnchors.length}`,
    `Showing: ${anchors.length} of ${allScopedAnchors.length}`,
    `Triggers: ${triggerSummary}`,
  ];
  for (const anchor of anchors.slice(-5)) {
    lines.push(`- ${anchor.name} [${anchor.type}] ${anchor.meta?.purpose ?? 'unset'} @ ${anchor.timestamp}`);
  }
  return lines.join('\n');
}
