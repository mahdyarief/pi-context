import fs from 'node:fs';
import path from 'node:path';
import type { MemoryFile, MemoryFrontmatter } from '../types.js';

export function getMemoryCoreDir(memoryDir: string): string {
  return path.join(memoryDir, 'core');
}

export function getMemoryUserDir(memoryDir: string): string {
  return path.join(getMemoryCoreDir(memoryDir), 'user');
}

export function isMemoryInitialized(memoryDir: string): boolean {
  return fs.existsSync(getMemoryUserDir(memoryDir));
}

function validateFrontmatter(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'No frontmatter found' };
  const frontmatter = data as MemoryFrontmatter;
  if (frontmatter.description !== undefined && typeof frontmatter.description !== 'string') return { valid: false, error: 'description must be string' };
  if (frontmatter.limit !== undefined && (typeof frontmatter.limit !== 'number' || frontmatter.limit <= 0)) return { valid: false, error: 'limit must be positive number' };
  if (frontmatter.tags !== undefined && !Array.isArray(frontmatter.tags)) return { valid: false, error: 'tags must be array' };
  return { valid: true };
}

function parseFrontmatterValue(value: string): unknown {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return trimmed;
}

function parseMemoryFileContent(filePath: string, content: string): MemoryFile {
  if (!content.startsWith('---\n')) {
    return { path: filePath, frontmatter: { description: 'No description' }, content };
  }

  const endMarker = content.indexOf('\n---\n', 4);
  if (endMarker === -1) {
    return { path: filePath, frontmatter: { description: 'No description' }, content };
  }

  const frontmatterBlock = content.slice(4, endMarker);
  const body = content.slice(endMarker + 5);
  const lines = frontmatterBlock.split(/\r?\n/);
  const parsed: Record<string, unknown> = {};
  let currentArrayKey: string | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    const arrayMatch = line.match(/^\s*-\s*(.*)$/);
    if (arrayMatch && currentArrayKey) {
      const existing = parsed[currentArrayKey];
      if (Array.isArray(existing)) existing.push(String(parseFrontmatterValue(arrayMatch[1])));
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) continue;
    const [, key, rawValue] = keyMatch;
    if (rawValue === '') {
      parsed[key] = [];
      currentArrayKey = key;
      continue;
    }
    parsed[key] = parseFrontmatterValue(rawValue);
    currentArrayKey = null;
  }

  if (!parsed || Object.keys(parsed).length === 0 || !validateFrontmatter(parsed).valid) {
    return { path: filePath, frontmatter: { description: 'No description' }, content };
  }

  return { path: filePath, frontmatter: parsed as unknown as MemoryFrontmatter, content: body };
}

export async function readMemoryFileAsync(filePath: string): Promise<MemoryFile | null> {
  try {
    return parseMemoryFileContent(filePath, await fs.promises.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export async function listMemoryFilesAsync(memoryDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walkDir(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return walkDir(fullPath);
      if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath);
    }));
  }

  await walkDir(memoryDir);
  return files;
}

export function writeMemoryFile(filePath: string, content: string, frontmatter: MemoryFrontmatter): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = ['---', `description: ${frontmatter.description}`];
  if (frontmatter.limit !== undefined) lines.push(`limit: ${frontmatter.limit}`);
  if (frontmatter.tags) {
    lines.push('tags:');
    for (const tag of frontmatter.tags) lines.push(`  - ${tag}`);
  }
  if (frontmatter.created) lines.push(`created: ${frontmatter.created}`);
  if (frontmatter.updated) lines.push(`updated: ${frontmatter.updated}`);
  lines.push('---', '', content);
  fs.writeFileSync(filePath, `${lines.join('\n')}`);
}
