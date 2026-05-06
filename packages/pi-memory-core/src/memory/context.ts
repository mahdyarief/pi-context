import fs from 'node:fs';
import type { MemoryFile, MemoryMdSettings } from '../types.js';
import { getGlobalMemoryDir, getMemoryDir } from '../config/settings.js';
import { getMemoryCoreDir, listMemoryFilesAsync, readMemoryFileAsync } from './files.js';

export function formatMemoryContext(context: string): string {
  return context.trimStart().startsWith('<memory_context') ? context : `<memory_context mode="normal">\n${context}\n</memory_context>`;
}

export function countMemoryContextFiles(context: string): number {
  return context.split('\n').filter((line) => line.startsWith('-')).length;
}

async function readMemoryFiles(memoryDir: string): Promise<{ files: string[]; memories: Array<MemoryFile | null> } | null> {
  try {
    const stat = await fs.promises.stat(memoryDir);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }

  const files = await listMemoryFilesAsync(memoryDir);
  if (files.length === 0) return null;

  return { files, memories: await Promise.all(files.map((filePath) => readMemoryFileAsync(filePath))) };
}

export function memoryContextItemTpl(entry: { path: string; description?: string; tags?: string[] | string; priority?: 'normal' | 'high' }): string[] {
  const tags = Array.isArray(entry.tags) ? entry.tags.join(', ') : entry.tags;
  return [
    `- path: ${entry.path}`,
    `  priority: ${entry.priority ?? 'normal'}`,
    `  description: ${entry.description || 'No description'}`,
    `  tags: ${tags || 'none'}`,
  ];
}

export function memoryContextHeaderTpl(mode: 'normal' | 'tape' = 'normal', options: { handoffMode?: 'auto' | 'manual' } = {}): string[] {
  const lines = [`<memory_context mode="${mode}">`];
  if (mode === 'normal') {
    lines.push('<instructions>', 'These memory files can help you better understand the project and the user.', '</instructions>');
  }
  if (mode === 'tape') {
    lines.push('<instructions>', 'Tape is enabled for this conversation. Use tape tools when you need anchors or tape history.');
    if (options.handoffMode === 'manual') {
      lines.push('Handoff mode: manual. `tape_handoff` is blocked unless the keyword is triggered or user create manually.');
    }
    lines.push('</instructions>');
  }
  return lines;
}

export function memoryContextTpl(entries: Array<{ path: string; memory: MemoryFile }> = [], options: { includeHeader?: boolean; mode?: 'normal' | 'tape' } = {}): string[] {
  const lines: string[] = [];
  if (options.includeHeader !== false) lines.push(...memoryContextHeaderTpl(options.mode ?? 'normal'));
  for (const entry of entries) {
    if (!entry.path || !entry.memory) continue;
    const { description, tags } = entry.memory.frontmatter;
    lines.push(...memoryContextItemTpl({ path: entry.path, description, tags }));
  }
  return lines;
}

type MemoryContextScope = { label: string; memoryDir: string; scanDir?: string };

async function buildMemoryContextSection(scope: MemoryContextScope): Promise<string[] | null> {
  const scannedFiles = await readMemoryFiles(scope.scanDir ?? scope.memoryDir);
  if (!scannedFiles) return null;

  const source = scope.label === 'Shared Global Memory' ? 'global' : 'project';
  const lines: string[] = [`<memory_files source="${source}" directory="${scope.memoryDir}">`];
  const entries = scannedFiles.files
    .map((filePath, index) => ({ path: filePath, memory: scannedFiles.memories[index] }))
    .filter((entry): entry is { path: string; memory: MemoryFile } => Boolean(entry.memory));

  lines.push(...memoryContextTpl(entries, { includeHeader: false }));
  lines.push('</memory_files>');
  return lines;
}

export async function buildMemoryContextAsync(settings: MemoryMdSettings, cwd: string): Promise<string> {
  const projectMemoryDir = getMemoryDir(settings, cwd);
  const globalMemoryDir = getGlobalMemoryDir(settings);
  const scopes: MemoryContextScope[] = [];

  if (globalMemoryDir && globalMemoryDir !== projectMemoryDir) {
    scopes.push({ label: 'Shared Global Memory', memoryDir: globalMemoryDir });
  }

  scopes.push({ label: 'Project Memory', memoryDir: projectMemoryDir, scanDir: getMemoryCoreDir(projectMemoryDir) });

  const sections = (await Promise.all(scopes.map((scope) => buildMemoryContextSection(scope)))).filter((section): section is string[] => section !== null);
  if (sections.length === 0) return '';

  const lines = memoryContextTpl([], { mode: 'normal' });
  for (const section of sections) lines.push(...section);
  lines.push('</memory_context>');
  return lines.join('\n');
}
