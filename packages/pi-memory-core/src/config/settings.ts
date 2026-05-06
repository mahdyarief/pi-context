import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HookAction, HookConfig, HookTrigger, MemoryMdSettings } from '../types.js';
import { defaultTapeConfig, type TapeKeywordConfig } from '../tape/types.js';
import { DEFAULT_LOCAL_PATH, DEFAULT_TAPE_EXCLUDE_DIRS, expandHomePath, getProjectMeta } from '../utils.js';

export const DEFAULT_MEMORY_SCAN: [number, number] = [72, 168];
export const DEFAULT_GLOBAL_MEMORY_DIRNAME = 'global';

export const DEFAULT_HOOKS: Required<HookConfig> = {
  sessionStart: ['pull'],
  sessionEnd: [],
};

export const DEFAULT_SETTINGS: MemoryMdSettings = {
  enabled: true,
  repoUrl: '',
  localPath: DEFAULT_LOCAL_PATH,
  hooks: DEFAULT_HOOKS,
  delivery: 'message-append',
  injection: 'message-append',
  memoryDir: {
    repoUrl: '',
    localPath: DEFAULT_LOCAL_PATH,
  },
  tape: {
    enabled: false,
    onlyGit: true,
    excludeDirs: DEFAULT_TAPE_EXCLUDE_DIRS,
    context: { ...defaultTapeConfig.context },
    anchor: { ...defaultTapeConfig.anchor },
  },
};

export function normalizeMemoryScanRange(memoryScan?: [number, number]): [number, number] {
  const [startHours, maxHours] = memoryScan ?? DEFAULT_MEMORY_SCAN;
  const normalizedStart = Number.isFinite(startHours) && startHours > 0 ? Math.floor(startHours) : DEFAULT_MEMORY_SCAN[0];
  const normalizedMax = Number.isFinite(maxHours) && maxHours > 0 ? Math.floor(maxHours) : DEFAULT_MEMORY_SCAN[1];
  return [normalizedStart, Math.max(normalizedStart, normalizedMax)];
}

export function expandPath(filePath: string): string {
  return expandHomePath(filePath);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMergeSettings<T>(base: T, overrides: Partial<T>): T {
  const result = { ...base } as Record<string, unknown>;

  for (const [key, overrideValue] of Object.entries(overrides)) {
    if (overrideValue === undefined) continue;
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      result[key] = deepMergeSettings(baseValue, overrideValue);
      continue;
    }
    result[key] = overrideValue;
  }

  return result as T;
}

function readSettingsFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizePathList(value: string[] | undefined): string[] {
  return [...new Set((value ?? []).map((entry: string) => entry.trim()).filter(Boolean))];
}

function normalizeAbsolutePathList(value: string[] | undefined): string[] {
  const entries = (value ?? []).map((entry: string) => expandPath(entry.trim()));
  return [...new Set(entries.filter((entry: string) => path.isAbsolute(entry)))];
}

function mergePathLists(...lists: Array<string[] | undefined>): string[] {
  return normalizePathList(lists.flatMap((list) => list ?? []));
}

function isHookAction(value: unknown): value is HookAction {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeHooks(hooks: unknown): HookConfig {
  if (!hooks || typeof hooks !== 'object') {
    return { sessionStart: [...DEFAULT_HOOKS.sessionStart], sessionEnd: [...DEFAULT_HOOKS.sessionEnd] };
  }

  if ('onSessionStart' in hooks) {
    const legacyHooks = hooks as { onSessionStart?: boolean };
    return {
      sessionStart: legacyHooks.onSessionStart === false ? [] : [...DEFAULT_HOOKS.sessionStart],
      sessionEnd: [],
    };
  }

  const config = hooks as Record<HookTrigger, unknown>;
  return {
    sessionStart: Array.isArray(config.sessionStart) ? config.sessionStart.filter(isHookAction) : [...DEFAULT_HOOKS.sessionStart],
    sessionEnd: Array.isArray(config.sessionEnd) ? config.sessionEnd.filter(isHookAction) : [...DEFAULT_HOOKS.sessionEnd],
  };
}

function normalizeKeywordList(keywords?: string[]): string[] {
  if (!Array.isArray(keywords)) return [];
  return [...new Set(keywords.map((keyword: string) => keyword.trim().toLowerCase()).filter(Boolean))];
}

export function normalizeTapeKeywords(config?: TapeKeywordConfig): TapeKeywordConfig {
  return {
    global: normalizeKeywordList(config?.global),
    project: normalizeKeywordList(config?.project),
  };
}

function sanitizeProjectSettings(
  rawSettings: Partial<MemoryMdSettings> & { autoSync?: { onSessionStart?: boolean } },
): Partial<MemoryMdSettings> & { autoSync?: { onSessionStart?: boolean } } {
  const sanitized: Partial<MemoryMdSettings> & { autoSync?: { onSessionStart?: boolean } } = {
    ...rawSettings,
    repoUrl: undefined,
    localPath: undefined,
    hooks: undefined,
    autoSync: undefined,
    memoryDir: undefined,
  };

  if (sanitized.tape) {
    sanitized.tape = {
      ...sanitized.tape,
      tapePath: undefined,
    };
  }

  return sanitized;
}

function normalizeSettings(
  rawSettings: MemoryMdSettings & { hooks?: MemoryMdSettings['hooks']; autoSync?: { onSessionStart?: boolean } },
): MemoryMdSettings {
  if (rawSettings.memoryDir?.localPath && !rawSettings.localPath) rawSettings.localPath = rawSettings.memoryDir.localPath;
  if (rawSettings.memoryDir?.repoUrl && !rawSettings.repoUrl) rawSettings.repoUrl = rawSettings.memoryDir.repoUrl;

  const loadedSettings = deepMergeSettings(DEFAULT_SETTINGS, rawSettings);
  const delivery = rawSettings.delivery ?? rawSettings.injection ?? loadedSettings.delivery ?? loadedSettings.injection;
  loadedSettings.delivery = delivery;
  loadedSettings.injection = delivery;
  loadedSettings.hooks = normalizeHooks(rawSettings.hooks ?? rawSettings.autoSync ?? loadedSettings.hooks);

  if (rawSettings.tape) {
    loadedSettings.tape ??= {};
    loadedSettings.tape.enabled = rawSettings.tape.enabled !== false;
  }

  if (loadedSettings.localPath) loadedSettings.localPath = expandPath(loadedSettings.localPath);

  if (loadedSettings.tape?.context?.memoryScan) {
    loadedSettings.tape ??= {};
    loadedSettings.tape.context ??= {};
    loadedSettings.tape.context.memoryScan = normalizeMemoryScanRange(loadedSettings.tape.context.memoryScan);
  }

  if (loadedSettings.tape) {
    loadedSettings.tape.onlyGit = loadedSettings.tape.onlyGit !== false;
    loadedSettings.tape.excludeDirs = normalizeAbsolutePathList([
      ...(DEFAULT_TAPE_EXCLUDE_DIRS ?? []),
      ...(loadedSettings.tape.excludeDirs ?? []),
    ]);
  }

  if (loadedSettings.tape?.context) {
    loadedSettings.tape.context.whitelist = mergePathLists(
      loadedSettings.tape.context.alwaysInclude,
      loadedSettings.tape.context.whitelist,
    );
    loadedSettings.tape.context.blacklist = normalizePathList(loadedSettings.tape.context.blacklist);
  }

  if (loadedSettings.tape?.anchor) {
    loadedSettings.tape.anchor.mode = loadedSettings.tape.anchor.mode === 'manual' ? 'manual' : 'auto';
    loadedSettings.tape.anchor.keywords = normalizeTapeKeywords(loadedSettings.tape.anchor.keywords);
  }

  return loadedSettings;
}

export function loadSettings(cwd = process.cwd()): MemoryMdSettings {
  const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent');
  const globalSettingsPath = path.join(agentDir, 'settings.json');
  const projectSettingsPath = path.join(cwd, '.pi', 'settings.json');
  const globalSettings = readSettingsFile(globalSettingsPath);
  const projectSettings = readSettingsFile(projectSettingsPath);
  const globalMemorySettings = (globalSettings['pi-context'] ?? {}) as MemoryMdSettings;
  const projectMemorySettings = sanitizeProjectSettings(
    (projectSettings['pi-context'] ?? {}) as Partial<MemoryMdSettings> & { autoSync?: { onSessionStart?: boolean } },
  );
  const rawSettings = deepMergeSettings(globalMemorySettings, projectMemorySettings) as MemoryMdSettings & {
    hooks?: MemoryMdSettings['hooks'];
    autoSync?: { onSessionStart?: boolean };
  };
  return normalizeSettings(rawSettings);
}

export function getMemoryDir(settings: MemoryMdSettings, cwd: string): string {
  const localPath = settings.localPath || DEFAULT_LOCAL_PATH;
  const { mainRoot, name } = getProjectMeta(cwd);
  return path.join(localPath, mainRoot ? path.basename(mainRoot) : name);
}

export function getGlobalMemoryDir(settings: MemoryMdSettings): string | null {
  if (!Object.hasOwn(settings.memoryDir ?? {}, 'globalMemory')) return null;
  const globalMemory = settings.memoryDir?.globalMemory;
  if (globalMemory === undefined || globalMemory === null || globalMemory === '') return null;

  const directoryName = globalMemory.trim();
  const safeDirectoryName = path.basename(directoryName).replace(/^\.+$/, DEFAULT_GLOBAL_MEMORY_DIRNAME) || DEFAULT_GLOBAL_MEMORY_DIRNAME;
  const localPath = settings.localPath || DEFAULT_LOCAL_PATH;
  return path.join(localPath, safeDirectoryName);
}
