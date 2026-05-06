import fs from 'node:fs';
import type { MemoryMdSettings, MemoryMeta } from '../types.js';
import { getProjectMeta } from '../utils.js';
import { getGlobalMemoryDir, getMemoryDir } from '../config/settings.js';
import { isMemoryInitialized, listMemoryFilesAsync } from './files.js';

export async function getMemoryMeta(settings: MemoryMdSettings, cwd: string): Promise<MemoryMeta> {
  const projectMemoryDir = getMemoryDir(settings, cwd);
  const globalMemoryDir = getGlobalMemoryDir(settings);
  const globalMemoryExists = !!globalMemoryDir && fs.existsSync(globalMemoryDir);

  const [projectFiles, globalFiles] = await Promise.all([
    listMemoryFilesAsync(projectMemoryDir),
    globalMemoryExists && globalMemoryDir !== projectMemoryDir ? listMemoryFilesAsync(globalMemoryDir) : null,
  ]);

  const projectMeta = getProjectMeta(cwd);

  return {
    ...projectMeta,
    initialized: isMemoryInitialized(projectMemoryDir),
    memoryPath: projectMemoryDir,
    project: {
      scope: 'project',
      dir: projectMemoryDir,
      exists: fs.existsSync(projectMemoryDir),
      fileCount: projectFiles.length,
    },
    global: {
      scope: 'global',
      dir: globalMemoryDir,
      exists: globalMemoryExists,
      fileCount: globalFiles?.length ?? null,
    },
  };
}
