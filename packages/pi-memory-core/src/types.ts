import type { TapeConfig } from './tape/types.js';

export interface MemoryFrontmatter {
  description: string;
  limit?: number;
  tags?: string[];
  created?: string;
  updated?: string;
}

export interface MemoryFile {
  path: string;
  frontmatter: MemoryFrontmatter;
  content: string;
}

export interface ProjectMeta {
  cwd: string;
  gitRoot: string | null;
  root: string;
  name: string;
  isWorktree: boolean;
  mainRoot?: string;
}

export interface MemoryMeta extends ProjectMeta {
  initialized: boolean;
  memoryPath: string;
  project: {
    scope: 'project';
    dir: string;
    exists: boolean;
    fileCount: number;
  };
  global: {
    scope: 'global';
    dir: string | null;
    exists: boolean;
    fileCount: number | null;
  };
}

export type HookTrigger = 'sessionStart' | 'sessionEnd';
export type BuiltinHookAction = 'pull' | 'push';
export type HookAction = BuiltinHookAction | (string & {});
export type HookConfig = Partial<Record<HookTrigger, HookAction[]>>;
export type MemoryDeliveryMode = 'system-prompt' | 'message-append';

export interface MemoryMdSettings {
  enabled?: boolean;
  repoUrl?: string;
  localPath?: string;
  hooks?: HookConfig;
  delivery?: MemoryDeliveryMode;
  injection?: MemoryDeliveryMode;
  tape?: TapeConfig;
  memoryDir?: {
    repoUrl?: string;
    localPath?: string;
    globalMemory?: string;
  };
}

export interface GitResult {
  stdout: string;
  success: boolean;
  timeout?: boolean;
}

export interface SyncResult {
  success: boolean;
  message: string;
  updated?: boolean;
  level?: 'info' | 'warning' | 'error';
}

export const memoryDeliveryModes = ['system-prompt', 'message-append'] as const;
