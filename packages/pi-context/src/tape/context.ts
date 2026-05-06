import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_MEMORY_SCAN,
  getMemoryCoreDir,
  getMemoryDir,
  listMemoryFilesAsync,
  normalizeMemoryScanRange,
  readMemoryFileAsync,
  type MemoryMdSettings,
} from '@pi-context/pi-memory-core';
import { scanEntries } from './reader.js';

type TapeContextResult = {
  content: string;
  fileCount: number;
};

const DEFAULT_CONVERSATION_EXCERPT_LIMIT = 6;

function formatTapeHeader(handoffMode: 'auto' | 'manual'): string[] {
  const lines = [
    '<memory_context mode="tape">',
    '<instructions>',
    'Tape is enabled for this conversation. Use tape tools when you need anchors or tape history.',
  ];
  if (handoffMode === 'manual') {
    lines.push('Handoff mode: manual. `tape_handoff` is blocked unless the keyword is triggered or user create manually.');
  }
  lines.push('</instructions>');
  return lines;
}

function normalizeProjectPath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

const DEFAULT_IGNORED_DIRS = new Set(['.cache', '.git', '.hg', '.idea', '.next', '.nuxt', '.pnpm-store', '.svn', '.turbo', '.venv', '.vscode', '.yarn', '__pycache__', 'build', 'coverage', 'dist', 'node_modules', 'out', 'target', 'temp', 'tmp', 'venv']);
const DEFAULT_IGNORED_FILES = new Set(['.DS_Store', 'bun.lockb', 'composer.lock', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);

function matchesPathRule(relativePath: string, rule: string): boolean {
  const normalizedRule = normalizeProjectPath(rule).replace(/^\.\//, '').replace(/\/$/, '');
  const normalizedPath = normalizeProjectPath(relativePath);
  return normalizedPath === normalizedRule || normalizedPath.startsWith(`${normalizedRule}/`);
}

function matchesDefaultIgnoredPath(filePath: string, projectRoot: string): boolean {
  const relativePath = isPathInside(projectRoot, filePath) ? path.relative(projectRoot, filePath) : filePath;
  const segments = relativePath.split(path.sep).filter(Boolean);
  const baseName = path.basename(filePath);
  if (DEFAULT_IGNORED_FILES.has(baseName)) return true;
  if (baseName.startsWith('.')) return true;
  return segments.some((segment) => DEFAULT_IGNORED_DIRS.has(segment) || segment.startsWith('.'));
}

async function getRecentMemoryFiles(memoryDir: string, fileLimit: number): Promise<string[]> {
  const coreDir = getMemoryCoreDir(memoryDir);
  let files = await listMemoryFilesAsync(coreDir);
  files = files.filter((filePath) => path.extname(filePath).toLowerCase() === '.md');

  const withStats = await Promise.all(
    files.map(async (filePath) => {
      try {
        const stat = await fs.promises.stat(filePath);
        return { filePath, mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    }),
  );

  return withStats
    .filter((entry): entry is { filePath: string; mtimeMs: number } => entry !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, fileLimit)
    .map((entry) => entry.filePath);
}

function getEntryTimestamp(entry: unknown): number {
  const timestamp = typeof (entry as { timestamp?: string }).timestamp === 'string'
    ? Date.parse((entry as { timestamp: string }).timestamp)
    : Number.NaN;
  return timestamp;
}

function filterEntriesByHours(entries: unknown[], hours: number, now = Date.now()): unknown[] {
  const cutoff = now - hours * 60 * 60 * 1000;
  return entries.filter((entry) => {
    const timestamp = getEntryTimestamp(entry);
    return !Number.isFinite(timestamp) || timestamp >= cutoff;
  });
}

function formatConversationLine(entry: unknown): string | null {
  if ((entry as { type?: string }).type === 'message') {
    const message = (entry as { message?: { role?: string; content?: unknown } }).message;
    const role = message?.role === 'user' ? 'User' : message?.role === 'assistant' ? 'Assistant' : null;
    if (!role) return null;
    if (typeof message?.content === 'string') {
      const trimmed = message.content.trim();
      return trimmed ? `${role}: ${trimmed}` : null;
    }
    if (Array.isArray(message?.content)) {
      const text = message.content
        .map((part) => (part && typeof part === 'object' && (part as { type?: string }).type === 'text' ? String((part as { text?: unknown }).text ?? '').trim() : ''))
        .filter(Boolean)
        .join(' ')
        .trim();
      return text ? `${role}: ${text}` : null;
    }
    return null;
  }

  if ((entry as { type?: string }).type === 'compaction') {
    const summary = String((entry as { summary?: unknown }).summary ?? '').trim();
    return summary ? `[Compaction] ${summary}` : null;
  }

  return null;
}

function buildConversationExcerpt(settings: MemoryMdSettings, cwd: string): string[] {
  const entries = scanEntries(cwd, undefined, [], {
    entryScope: 'project',
    limit: 40,
  });
  const [startHours, maxHours] = normalizeMemoryScanRange(settings.tape?.context?.memoryScan ?? DEFAULT_MEMORY_SCAN);
  const now = Date.now();
  let selectedEntries: unknown[] = [];

  for (let hours = startHours; hours <= maxHours; hours += 24) {
    const windowEntries = filterEntriesByHours(entries, hours, now);
    const lines = windowEntries.map(formatConversationLine).filter(Boolean);
    if (lines.length > 0) {
      selectedEntries = windowEntries;
      break;
    }
  }

  if (selectedEntries.length === 0) {
    selectedEntries = entries;
  }

  const lines = selectedEntries
    .map(formatConversationLine)
    .filter((line): line is string => Boolean(line))
    .slice(-DEFAULT_CONVERSATION_EXCERPT_LIMIT);

  if (lines.length === 0) return [];
  return ['<recent_conversation>', ...lines, '</recent_conversation>'];
}

function getToolCallPaths(entry: unknown, cwd: string): string[] {
  const content = (entry as { message?: { content?: unknown } })?.message?.content;
  if (!Array.isArray(content)) return [];

  const paths: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== 'object' || (part as { type?: string }).type !== 'toolCall') continue;
    const args = (part as { arguments?: { path?: unknown } }).arguments;
    const rawPath = typeof args?.path === 'string' ? args.path.trim() : '';
    if (!rawPath) continue;
    paths.push(path.isAbsolute(rawPath) ? rawPath : path.resolve(cwd, rawPath));
  }
  return paths;
}

async function collectSmartContextFiles(settings: MemoryMdSettings, cwd: string, memoryDir: string, fileLimit: number): Promise<string[]> {
  const entries = scanEntries(cwd, undefined, [], {
    types: ['message'],
    entryScope: 'project',
    limit: 200,
  });
  const blacklist = settings.tape?.context?.blacklist ?? [];
  const whitelist = settings.tape?.context?.whitelist ?? [];
  const selected = new Set<string>();
  const [startHours, maxHours] = normalizeMemoryScanRange(settings.tape?.context?.memoryScan ?? DEFAULT_MEMORY_SCAN);
  const now = Date.now();

  const reversedEntries = [...entries].reverse();

  function collectFromEntries(filteredEntries: typeof reversedEntries): void {
    for (const entry of filteredEntries) {
      for (const filePath of getToolCallPaths(entry, cwd)) {
        if (!isPathInside(cwd, filePath)) continue;
        const relativePath = path.relative(cwd, filePath);
        if (matchesDefaultIgnoredPath(filePath, cwd)) continue;
        if (blacklist.some((rule) => matchesPathRule(relativePath, rule))) continue;
        if (!fs.existsSync(filePath)) continue;
        selected.add(filePath);
        if (selected.size >= fileLimit) break;
      }
      if (selected.size >= fileLimit) break;
    }
  }

  for (let hours = startHours; hours <= maxHours && selected.size < fileLimit; hours += 24) {
    const cutoff = now - hours * 60 * 60 * 1000;
    collectFromEntries(
      reversedEntries.filter((entry) => {
        const timestamp = getEntryTimestamp(entry);
        return timestamp >= cutoff || !Number.isFinite(timestamp);
      }),
    );
    if (selected.size > 0) break;
  }

  if (selected.size === 0) {
    collectFromEntries(reversedEntries);
  }

  for (const rule of whitelist) {
    if (selected.size >= fileLimit) break;
    const targetPath = path.resolve(cwd, rule);
    if (!fs.existsSync(targetPath)) continue;
    const stats = fs.statSync(targetPath);
    if (stats.isFile()) {
      if (!matchesDefaultIgnoredPath(targetPath, cwd) && !blacklist.some((blacklistRule) => matchesPathRule(path.relative(cwd, targetPath), blacklistRule))) {
        selected.add(targetPath);
      }
      continue;
    }
    if (!stats.isDirectory()) continue;
    const stack = [targetPath];
    while (stack.length > 0 && selected.size < fileLimit) {
      const current = stack.pop();
      if (!current) continue;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (entry.isFile() && !matchesDefaultIgnoredPath(fullPath, cwd) && !blacklist.some((blacklistRule) => matchesPathRule(path.relative(cwd, fullPath), blacklistRule))) {
          selected.add(fullPath);
        }
        if (selected.size >= fileLimit) break;
      }
    }
  }

  if (selected.size > 0) return [...selected].slice(0, fileLimit);
  return getRecentMemoryFiles(memoryDir, fileLimit);
}

export async function buildTapeContextAsync(settings: MemoryMdSettings, cwd: string): Promise<TapeContextResult | null> {
  if (!settings.tape?.enabled) return null;

  const memoryDir = getMemoryDir(settings, cwd);
  const fileLimit = settings.tape.context?.fileLimit ?? 10;
  const strategy = settings.tape.context?.strategy ?? 'smart';
  const filePaths = strategy === 'smart'
    ? await collectSmartContextFiles(settings, cwd, memoryDir, fileLimit)
    : await getRecentMemoryFiles(memoryDir, fileLimit);
  if (filePaths.length === 0) return null;

  const lines = formatTapeHeader(settings.tape.anchor?.mode ?? 'auto');
  lines.push(...buildConversationExcerpt(settings, cwd));
  lines.push(`<memory_files source="project" directory="${memoryDir}">`);

  let fileCount = 0;
  for (const filePath of filePaths) {
    if (isPathInside(memoryDir, filePath)) {
      const memory = await readMemoryFileAsync(filePath);
      if (!memory) continue;
      const tags = Array.isArray(memory.frontmatter.tags) ? memory.frontmatter.tags.join(', ') : 'none';
      lines.push(`- path: ${filePath}`);
      lines.push('  priority: normal');
      lines.push(`  description: ${memory.frontmatter.description || 'No description'}`);
      lines.push(`  tags: ${tags || 'none'}`);
      fileCount += 1;
      continue;
    }

    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) continue;
      lines.push(`- path: ${filePath}`);
      lines.push('  priority: referenced');
      lines.push(`  description: Project file referenced in recent session activity`);
      lines.push('  tags: project');
      fileCount += 1;
    } catch {
      // ignore missing project file
    }
  }

  if (fileCount === 0) return null;
  lines.push('</memory_files>');
  lines.push('</memory_context>');
  return { content: lines.join('\n'), fileCount };
}
