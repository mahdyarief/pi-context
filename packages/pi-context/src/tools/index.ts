import fs from 'node:fs';
import path from 'node:path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import {
  getMemoryCoreDir,
  getMemoryMeta,
  listMemoryFilesAsync,
  syncRepository,
  pushRepository,
  gitExec,
  getProjectMeta,
  hasSymlinkInPath,
  resolvePathWithin,
  type MemoryMdSettings,
} from '@pi-context/pi-memory-core';

const MEMORY_SEARCH_TIMEOUT_MS = 5000;
const MAX_SEARCH_PATTERN_LENGTH = 200;
const MAX_SEARCH_RESULTS = 50;

export const toolSurface = {
  memory_sync: 'ported-minimal',
  memory_list: 'ported-minimal',
  memory_search: 'ported-minimal',
  memory_check: 'ported-minimal',
} as const;

type PiLike = Pick<ExtensionAPI, 'registerTool' | 'exec'>;

function textResult(text: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: 'text', text }],
    details,
  };
}

function createPiGitExec(pi: Pick<ExtensionAPI, 'exec'>) {
  return (command: string, args: string[], options?: { cwd?: string; signal?: AbortSignal }) => pi.exec(command, args, options);
}

export function registerMemorySync(pi: PiLike, settings: MemoryMdSettings): void {
  pi.registerTool({
    name: 'memory_sync',
    description:
      'Synchronize the memory git repository. Use status to inspect changes. Do not run pull or push unless the user explicitly asks for sync/pull/push.',
    parameters: { type: 'object', properties: { action: { enum: ['pull', 'push', 'status'] } }, required: ['action'] },
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: { cwd: string }) {
      const { action } = params as { action: 'pull' | 'push' | 'status' };
      if (!settings.localPath) {
        return textResult('Memory localPath is not configured.', { success: false, initialized: false });
      }

      const localPath = settings.localPath;
      const memoryMeta = await getMemoryMeta(settings, ctx.cwd);
      const exec = createPiGitExec(pi);

      if (action === 'status') {
        const memoryRepo = getProjectMeta(localPath);
        const initialized = memoryMeta.initialized && memoryRepo.gitRoot === memoryRepo.cwd;
        if (!initialized) {
          return textResult('Memory repository not initialized. Use memory_init to set up.', { initialized: false });
        }
        const result = await gitExec(exec, localPath, ['status', '--porcelain']);
        if (!result.success) {
          return textResult(`Git status failed: ${result.stdout || 'Unknown error'}`, { success: false, error: result.stdout });
        }
        const dirty = result.stdout.trim().length > 0;
        return textResult(dirty ? `Changes detected:\n${result.stdout}` : 'No uncommitted changes', {
          initialized: true,
          dirty,
        });
      }

      if (action === 'pull') {
        const result = await syncRepository(exec, settings);
        return textResult(result.message, { success: result.success });
      }

      if (action === 'push') {
        const result = await pushRepository(exec, settings);
        return textResult(result.message, { success: result.success, pushed: result.updated ?? false });
      }

      return textResult('Unknown action');
    },
  } as never);
}

export function registerMemoryList(pi: PiLike, settings: MemoryMdSettings): void {
  pi.registerTool({
    name: 'memory_list',
    description: 'List memory files: project paths are relative, global paths are absolute',
    parameters: { type: 'object', properties: { directory: { type: 'string' } } },
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: { cwd: string }) {
      const { directory } = (params ?? {}) as { directory?: string };
      const memoryMeta = await getMemoryMeta(settings, ctx.cwd);

      function toProjectRelativePaths(files: string[]): string[] {
        return files.map((filePath) => path.relative(memoryMeta.memoryPath, filePath).split(path.sep).join('/'));
      }

      if (directory) {
        const listDir = resolvePathWithin(memoryMeta.memoryPath, directory);
        if (!listDir || hasSymlinkInPath(memoryMeta.memoryPath, listDir)) {
          return textResult(`Invalid memory directory: ${directory}`, { files: [], count: 0, error: true });
        }
        const files = toProjectRelativePaths(await listMemoryFilesAsync(listDir));
        return textResult(`Memory files (${files.length}):\n\n${files.map((p) => `  - ${p}`).join('\n')}`, {
          files,
          count: files.length,
        });
      }

      if (!memoryMeta.global.dir || memoryMeta.global.dir === memoryMeta.memoryPath) {
        const files = toProjectRelativePaths(await listMemoryFilesAsync(memoryMeta.memoryPath));
        return textResult(`Memory files (${files.length}):\n\n${files.map((p) => `  - ${p}`).join('\n')}`, {
          files,
          count: files.length,
        });
      }

      const [globalFiles, projectFiles] = await Promise.all([
        listMemoryFilesAsync(memoryMeta.global.dir),
        listMemoryFilesAsync(memoryMeta.memoryPath),
      ]);
      const files = [...globalFiles, ...toProjectRelativePaths(projectFiles)];
      return textResult(`Memory files (${files.length}):\n\n${files.map((p) => `  - ${p}`).join('\n')}`, {
        files,
        count: files.length,
      });
    },
  } as never);
}

export function registerMemorySearch(pi: PiLike, settings: MemoryMdSettings): void {
  pi.registerTool({
    name: 'memory_search',
    description:
      'Search memory files. Defaults to project memory. Use query for frontmatter tags/descriptions, grep or rg for full-text markdown search.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, grep: { type: 'string' }, rg: { type: 'string' }, scope: { enum: ['project', 'global', 'all'] } } },
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: { cwd: string }) {
      const { query, grep, rg, scope = 'project' } = (params ?? {}) as {
        query?: string;
        grep?: string;
        rg?: string;
        scope?: 'project' | 'global' | 'all';
      };
      const memoryMeta = await getMemoryMeta(settings, ctx.cwd);
      const searchRoots = [
        ...(scope === 'project' || scope === 'all' ? [{ label: 'project', memoryDir: memoryMeta.memoryPath }] : []),
        ...(memoryMeta.global.dir && memoryMeta.global.dir !== memoryMeta.memoryPath && (scope === 'global' || scope === 'all')
          ? [{ label: 'global', memoryDir: memoryMeta.global.dir }]
          : []),
      ].map((root) => ({ ...root, coreDir: getMemoryCoreDir(root.memoryDir) }));
      const existingRoots = searchRoots.filter((root) => fs.existsSync(root.coreDir));
      const sections: string[] = [];
      const matchedFiles = new Map<string, string>();

      if (existingRoots.length === 0) {
        return textResult(`Memory directory not found for scope: ${scope}`, { files: [], count: 0, scope });
      }
      if (!query && !grep && !rg) {
        return textResult('Provide query, grep, or rg to search memory files.', { files: [], count: 0, scope });
      }

      const customPattern = grep ?? rg;
      if (customPattern && customPattern.length > MAX_SEARCH_PATTERN_LENGTH) {
        return textResult(`Search pattern too long (${customPattern.length}). Max length is ${MAX_SEARCH_PATTERN_LENGTH}.`, {
          files: [],
          count: 0,
          scope,
          error: true,
        });
      }

      const escapedQuery = query ? query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
      const searchLabel = query ?? grep ?? rg ?? 'search';

      function formatMatchedPath(filePath: string, memoryDir: string, label: string): string {
        const relativePath = path.relative(memoryDir, filePath).split(path.sep).join('/');
        return label === 'global' ? filePath : relativePath;
      }

      async function runTool(tool: string, args: string[], memoryDir: string, label: string): Promise<string[]> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), MEMORY_SEARCH_TIMEOUT_MS);
        const { stdout } = await pi.exec(tool, args, { signal: controller.signal }).catch(() => ({ stdout: '' }));
        clearTimeout(timeoutId);
        const results: string[] = [];

        for (const line of (stdout || '').trim().split('\n')) {
          if (!line) continue;
          const match = line.match(/^([A-Za-z]:[^:]*|[^:]+):(.*)$/);
          if (!match) {
            results.push(line);
            continue;
          }
          const [, matchedFilePath, remainder] = match;
          const displayPath = formatMatchedPath(matchedFilePath, memoryDir, label);
          matchedFiles.set(displayPath, displayPath);
          results.push(`${displayPath}: ${remainder.trim()}`);
        }

        return results;
      }

      for (const { label, memoryDir, coreDir } of existingRoots) {
        const sectionPrefix = scope === 'all' ? `${label} ` : '';

        if (escapedQuery) {
          const tagResults = await runTool('grep', ['-rn', '--include=*.md', '-m', String(MAX_SEARCH_RESULTS), '-E', `^\\s*-\\s*${escapedQuery}`, coreDir], memoryDir, label);
          if (tagResults.length > 0) sections.push(`## ${sectionPrefix}Tags matching: ${query}`, ...tagResults.slice(0, 20));

          const descResults = await runTool('grep', ['-rn', '--include=*.md', '-m', String(MAX_SEARCH_RESULTS), '-E', `^description:\\s*.*${escapedQuery}`, coreDir], memoryDir, label);
          if (descResults.length > 0) sections.push('', `## ${sectionPrefix}Description matching: ${query}`, ...descResults.slice(0, 20));
        }

        if (grep) {
          const grepResults = await runTool('grep', ['-rn', '--include=*.md', '-m', String(MAX_SEARCH_RESULTS), '-E', grep, coreDir], memoryDir, label);
          if (grepResults.length > 0) sections.push('', `## ${sectionPrefix}Custom grep: ${grep}`, ...grepResults.slice(0, 50));
        }

        if (rg) {
          const rgResults = await runTool('rg', ['-t', 'md', '-m', String(MAX_SEARCH_RESULTS), rg, coreDir], memoryDir, label);
          if (rgResults.length > 0) sections.push('', `## ${sectionPrefix}Custom ripgrep: ${rg}`, ...rgResults.slice(0, 50));
        }
      }

      const fileList = Array.from(matchedFiles.keys());
      if (sections.length === 0) {
        return textResult(`No results found for "${searchLabel}".`, { files: [], count: 0, scope });
      }

      return textResult(`Found ${fileList.length} file(s) matching "${searchLabel}":\n\n${sections.join('\n')}\n\nUse read to view full content.`, {
        files: fileList,
        count: fileList.length,
        scope,
      });
    },
  } as never);
}

export function registerMemoryCheck(pi: PiLike, settings: MemoryMdSettings): void {
  pi.registerTool({
    name: 'memory_check',
    description: 'Check current project memory folder structure',
    parameters: { type: 'object', properties: {} },
    async execute(_toolCallId: string, _params: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: { cwd: string }) {
      const info = await getMemoryMeta(settings, ctx.cwd);
      if (!fs.existsSync(info.memoryPath)) {
        const missingGlobalMessage = info.global.dir && !info.global.exists ? `\n\nShared global memory directory not found: ${info.global.dir}` : '';
        return textResult(`Project memory directory not found: ${info.project.dir}${missingGlobalMessage}\n\nMemory may not be initialized yet.`, {
          exists: false,
        });
      }

      const requiredDirs = [
        ...(info.global.dir && info.global.exists && info.global.dir !== info.project.dir ? [{ label: 'Shared global', path: info.global.dir }] : []),
        { label: 'Project', path: info.memoryPath },
      ];

      const sections = await Promise.all(
        requiredDirs.map(async ({ label, path: memoryDir }) => {
          const files = await listMemoryFilesAsync(memoryDir);
          const relPaths = files.map((f) => path.relative(memoryDir, f));
          return [`## ${label} memory`, `Path: ${memoryDir}`, `Memory files (${relPaths.length}):`, relPaths.map((p) => `  ${p}`).join('\n')].join('\n');
        }),
      );
      const globalMemoryWarning = info.global.dir && !info.global.exists ? `Warning: shared global memory directory not found: ${info.global.dir}\n\n` : '';

      return textResult(`Memory directory structure for project: ${info.name}\n\n${globalMemoryWarning}${sections.join('\n\n')}`, {
        fileCount: (info.project.fileCount ?? 0) + (info.global.fileCount ?? 0),
        globalMemoryMissing: !!info.global.dir && !info.global.exists,
      });
    },
  } as never);
}

export function registerAllMemoryTools(pi: PiLike, settings: MemoryMdSettings): void {
  registerMemorySync(pi, settings);
  registerMemoryList(pi, settings);
  registerMemorySearch(pi, settings);
  registerMemoryCheck(pi, settings);
}
