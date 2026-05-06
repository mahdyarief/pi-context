import fs from 'node:fs';
import path from 'node:path';
import { getTapeBasePath, resolveTapeGate, type MemoryMdSettings } from '@pi-context/pi-memory-core';

export type TapeAnchorMeta = {
  trigger?: 'direct' | 'keyword' | 'manual';
  keywords?: string[];
  summary?: string;
  purpose?: string;
};

export type TapeAnchor = {
  id: string;
  name: string;
  type: 'handoff';
  sessionId: string;
  sessionEntryId: string;
  timestamp: string;
  meta?: TapeAnchorMeta;
};

export type TapeAnchorStore = {
  filePath: string;
  anchors: TapeAnchor[];
  append(anchor: TapeAnchor): void;
  list(limit?: number): TapeAnchor[];
  getLast(): TapeAnchor | null;
  deleteById(id: string): TapeAnchor | null;
  replaceAll(anchors: TapeAnchor[]): void;
};

function sortByTimestamp(anchors: TapeAnchor[]): TapeAnchor[] {
  return [...anchors].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function parseAnchorLine(line: string): TapeAnchor | null {
  try {
    const raw = JSON.parse(line) as Partial<TapeAnchor>;
    if (!raw.id || !raw.name || !raw.type || !raw.sessionId || !raw.sessionEntryId || !raw.timestamp) {
      return null;
    }
    return {
      id: raw.id,
      name: raw.name,
      type: raw.type,
      sessionId: raw.sessionId,
      sessionEntryId: raw.sessionEntryId,
      timestamp: raw.timestamp,
      meta: raw.meta,
    };
  } catch {
    return null;
  }
}

export function getTapeAnchorStore(settings: MemoryMdSettings, cwd: string): TapeAnchorStore | null {
  if (!settings.localPath) return null;

  const tapeGate = resolveTapeGate(cwd, settings.tape);
  if (!tapeGate.enabled || !tapeGate.project) return null;

  const tapeBasePath = getTapeBasePath(settings.localPath, settings.tape?.tapePath);
  const filePath = path.join(tapeBasePath, `${tapeGate.project.name}__anchors.jsonl`);

  function readAnchors(): TapeAnchor[] {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    return sortByTimestamp(content.split('\n').map((line) => line.trim()).filter(Boolean).map(parseAnchorLine).filter(Boolean) as TapeAnchor[]);
  }

  function writeAnchors(anchors: TapeAnchor[]): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const content = anchors.map((anchor) => JSON.stringify(anchor)).join('\n');
    fs.writeFileSync(filePath, content ? `${content}\n` : '', 'utf8');
  }

  return {
    filePath,
    get anchors() {
      return readAnchors();
    },
    append(anchor: TapeAnchor) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.appendFileSync(filePath, `${JSON.stringify(anchor)}\n`, 'utf8');
    },
    list(limit = 20) {
      return readAnchors().slice(-limit);
    },
    getLast() {
      const anchors = readAnchors();
      return anchors.length > 0 ? anchors[anchors.length - 1] : null;
    },
    deleteById(id: string) {
      const anchors = readAnchors();
      const match = anchors.find((anchor) => anchor.id === id) ?? null;
      if (!match) return null;
      writeAnchors(anchors.filter((anchor) => anchor.id !== id));
      return match;
    },
    replaceAll(anchors: TapeAnchor[]) {
      writeAnchors(sortByTimestamp(anchors));
    },
  };
}
