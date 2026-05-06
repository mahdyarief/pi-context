import fs from 'node:fs';
import path from 'node:path';
import type { SessionEntry } from '@mariozechner/pi-coding-agent';
import type { TapeAnchor } from './store.js';

type SessionHeader = { type: 'session'; id: string };

type EntryScope = 'session' | 'project';
type AnchorScope = 'session' | 'project';

type ScanOptions = {
  types?: SessionEntry['type'][];
  limit?: number;
  scan?: string;
  sinceAnchor?: string;
  lastAnchor?: boolean;
  betweenAnchors?: { start: string; end: string };
  betweenDates?: { start: string; end: string };
  entryScope?: EntryScope;
  anchorScope?: AnchorScope;
};

function getSessionParentDir(): string | null {
  const sessionDir = process.env.PI_CODING_AGENT_SESSION_DIR?.trim();
  if (sessionDir) return sessionDir;
  const agentDir = process.env.PI_CODING_AGENT_DIR?.trim();
  if (agentDir) return path.join(agentDir, 'sessions');
  return null;
}

function encodeSessionPath(cwd: string): string {
  return `--${cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`;
}

export function getSessionDir(cwd: string): string | null {
  const parent = getSessionParentDir();
  return parent ? path.join(parent, encodeSessionPath(cwd)) : null;
}

function getSessionFilePaths(cwd: string): string[] {
  const sessionDir = getSessionDir(cwd);
  if (!sessionDir || !fs.existsSync(sessionDir)) return [];
  return fs.readdirSync(sessionDir).filter((file) => file.endsWith('.jsonl')).map((file) => path.join(sessionDir, file));
}

function parseSessionFile(filePath: string): { header: SessionHeader; entries: SessionEntry[] } | null {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    const header = JSON.parse(lines[0]) as SessionHeader;
    if (header.type !== 'session') return null;
    const entries: SessionEntry[] = [];
    for (let index = 1; index < lines.length; index += 1) {
      try {
        entries.push(JSON.parse(lines[index]) as SessionEntry);
      } catch {
        // skip malformed line
      }
    }
    return { header, entries };
  } catch {
    return null;
  }
}

function getSessionEntries(cwd: string, sessionId?: string, scope: EntryScope = 'project'): SessionEntry[] {
  const files = getSessionFilePaths(cwd);
  const parsed = files.map(parseSessionFile).filter(Boolean) as Array<{ header: SessionHeader; entries: SessionEntry[] }>;
  if (scope === 'session' && sessionId) {
    return parsed.find((file) => file.header.id === sessionId)?.entries ?? [];
  }
  return parsed.flatMap((file) => file.entries).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function entryText(entry: SessionEntry): string {
  if (entry.type === 'message') {
    const content = (entry as SessionEntry & { message?: { content?: unknown } }).message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map((block) => (typeof block === 'object' && block && 'text' in block ? String((block as { text?: string }).text ?? '') : '')).join(' ');
    return '';
  }
  if (entry.type === 'compaction') return String((entry as SessionEntry & { summary?: string }).summary ?? '');
  return JSON.stringify(entry);
}

function resolveAnchorBounds(
  anchors: TapeAnchor[],
  sessionId: string | undefined,
  options: Pick<ScanOptions, 'sinceAnchor' | 'lastAnchor' | 'betweenAnchors' | 'betweenDates' | 'anchorScope'>,
): { since?: string; until?: string } {
  const candidateAnchors = options.anchorScope === 'project' ? anchors : anchors.filter((anchor) => anchor.sessionId === sessionId);
  const findLatestByName = (name: string) => candidateAnchors.filter((anchor) => anchor.name.toLowerCase().includes(name.toLowerCase())).at(-1) ?? null;

  if (options.betweenDates) {
    return { since: options.betweenDates.start, until: options.betweenDates.end };
  }
  if (options.betweenAnchors) {
    return {
      since: findLatestByName(options.betweenAnchors.start)?.timestamp,
      until: findLatestByName(options.betweenAnchors.end)?.timestamp,
    };
  }
  if (options.lastAnchor) {
    const lastAnchor = candidateAnchors.at(-1);
    return { since: lastAnchor?.timestamp };
  }
  if (options.sinceAnchor) {
    return { since: findLatestByName(options.sinceAnchor)?.timestamp };
  }
  return {};
}

export function scanEntries(
  cwd: string,
  sessionId: string | undefined,
  anchors: TapeAnchor[],
  options: ScanOptions,
): SessionEntry[] {
  const entries = getSessionEntries(cwd, sessionId, options.entryScope ?? 'project');
  const bounds = resolveAnchorBounds(anchors, sessionId, options);
  const filtered = entries.filter((entry) => {
    if (options.types?.length && !options.types.includes(entry.type)) return false;
    if (bounds.since && entry.timestamp <= bounds.since) return false;
    if (bounds.until && entry.timestamp > bounds.until) return false;
    if (options.scan && !entryText(entry).toLowerCase().includes(options.scan.toLowerCase())) return false;
    return true;
  });
  return filtered.slice(-(options.limit ?? 20));
}

export function formatEntrySummary(entry: SessionEntry): string {
  if (entry.type === 'message') {
    const role = (entry as SessionEntry & { message?: { role?: string } }).message?.role ?? 'unknown';
    return `  [${entry.timestamp}] message ${role}: ${entryText(entry)}`;
  }
  if (entry.type === 'compaction') {
    return `  [${entry.timestamp}] compaction: ${entryText(entry)}`;
  }
  return `  [${entry.timestamp}] ${entry.type}`;
}
