import fs from 'node:fs';
import path from 'node:path';
import type { MemoryMdSettings, SyncResult } from '../types.js';
import { DEFAULT_LOCAL_PATH, formatCommitTimestamp, getProjectMeta } from '../utils.js';
import { gitExec, type GitExecFn } from './client.js';

export const FETCH_TTL_MS = 12 * 60 * 60 * 1000;
export const GIT_TIMEOUT_MESSAGE =
  'Unable to connect to git repository, connection timeout (10s). Please check your network connection or try again later.';

export function getRepoName(settings: MemoryMdSettings): string {
  if (!settings.repoUrl) return 'memory-md';
  const match = settings.repoUrl.match(/\/([^/]+?)(\.git)?$/);
  return match ? match[1] : 'memory-md';
}

async function hasUpstreamBranch(exec: GitExecFn, cwd: string): Promise<boolean> {
  const upstreamResult = await gitExec(exec, cwd, ['rev-parse', '--abbrev-ref', '@{u}']);
  return upstreamResult.success;
}

async function getBehindCount(exec: GitExecFn, cwd: string): Promise<number | null> {
  if (!(await hasUpstreamBranch(exec, cwd))) return null;

  const behindResult = await gitExec(exec, cwd, ['rev-list', '--count', 'HEAD..@{u}']);
  if (!behindResult.success) return null;

  return Number(behindResult.stdout.trim() || '0');
}

async function hasCommitsToPush(exec: GitExecFn, cwd: string): Promise<boolean> {
  if (!(await hasUpstreamBranch(exec, cwd))) return true;

  const aheadResult = await gitExec(exec, cwd, ['rev-list', '--count', '@{u}..HEAD']);
  if (!aheadResult.success) return true;

  return Number(aheadResult.stdout.trim() || '0') > 0;
}

async function shouldFetch(exec: GitExecFn, cwd: string): Promise<boolean> {
  const fetchHeadResult = await gitExec(exec, cwd, ['rev-parse', '--git-path', 'FETCH_HEAD']);
  if (!fetchHeadResult.success) return true;

  const fetchHeadPath = fetchHeadResult.stdout.trim();
  if (!fetchHeadPath) return true;

  const absolutePath = path.isAbsolute(fetchHeadPath) ? fetchHeadPath : path.join(cwd, fetchHeadPath);

  try {
    const stat = fs.statSync(absolutePath);
    return Date.now() - stat.mtimeMs > FETCH_TTL_MS;
  } catch {
    return true;
  }
}

export async function syncRepository(exec: GitExecFn, settings: MemoryMdSettings): Promise<SyncResult> {
  const localPath = settings.localPath ?? DEFAULT_LOCAL_PATH;
  const { repoUrl } = settings;

  if (!repoUrl) {
    return { success: false, message: 'Git repository URL or local path not configured' };
  }

  const repoName = getRepoName(settings);

  if (fs.existsSync(localPath)) {
    const project = getProjectMeta(localPath);
    if (project.gitRoot !== project.cwd) {
      return { success: false, message: `Directory exists but is not a git repo: ${localPath}` };
    }

    if (await shouldFetch(exec, localPath)) {
      const fetchResult = await gitExec(exec, localPath, ['fetch']);
      if (fetchResult.timeout) return { success: false, message: GIT_TIMEOUT_MESSAGE };
      if (!fetchResult.success) return { success: false, message: fetchResult.stdout || 'Fetch failed' };
    }

    const behindCount = await getBehindCount(exec, localPath);
    if (behindCount === 0) {
      return { success: true, message: `[${repoName}] is already latest`, updated: false };
    }

    const updateResult = await gitExec(exec, localPath, ['rebase', '--autostash', '@{u}']);
    if (updateResult.timeout) return { success: false, message: GIT_TIMEOUT_MESSAGE };
    if (!updateResult.success) return { success: false, message: updateResult.stdout || 'Update failed' };

    if (behindCount !== null && behindCount > 0) {
      const remainingBehindCount = await getBehindCount(exec, localPath);
      if (remainingBehindCount && remainingBehindCount > 0) {
        return {
          success: false,
          message: `Pull did not update [${repoName}], still behind by ${remainingBehindCount} commit(s). Please resolve these git issues manually.`,
          level: 'warning',
        };
      }
    }

    const updated = behindCount !== null && behindCount > 0;

    return {
      success: true,
      message: updated ? `Pulled latest changes from [${repoName}]` : `[${repoName}] is already latest`,
      updated,
    };
  }

  fs.mkdirSync(localPath, { recursive: true });

  const memoryDirName = path.basename(localPath);
  const parentDir = path.dirname(localPath);
  const cloneResult = await gitExec(exec, parentDir, ['clone', repoUrl, memoryDirName]);

  if (cloneResult.timeout) return { success: false, message: GIT_TIMEOUT_MESSAGE };
  if (cloneResult.success) {
    return { success: true, message: `Cloned [${repoName}] successfully`, updated: true };
  }

  return { success: false, message: cloneResult.stdout || 'Clone failed' };
}

export async function pushRepository(exec: GitExecFn, settings: MemoryMdSettings): Promise<SyncResult> {
  const localPath = settings.localPath ?? DEFAULT_LOCAL_PATH;
  const { repoUrl } = settings;

  if (!repoUrl) {
    return { success: false, message: 'Git repository URL or local path not configured' };
  }

  const project = getProjectMeta(localPath);
  if (project.gitRoot !== project.cwd) {
    return { success: false, message: `Git repository not initialized: ${localPath}` };
  }

  const repoName = getRepoName(settings);
  const statusResult = await gitExec(exec, localPath, ['status', '--porcelain']);
  if (!statusResult.success) {
    return { success: false, message: statusResult.stdout || 'Git status failed' };
  }

  const hasChanges = statusResult.stdout.trim().length > 0;

  if (hasChanges) {
    const addResult = await gitExec(exec, localPath, ['add', '.']);
    if (!addResult.success) {
      return { success: false, message: addResult.stdout || 'Git add failed' };
    }

    const timestamp = formatCommitTimestamp();
    const commitResult = await gitExec(exec, localPath, ['commit', '-m', `Update memory - ${timestamp}`]);
    if (!commitResult.success) {
      return { success: false, message: commitResult.stdout || 'Commit failed' };
    }
  }

  if (!hasChanges && !(await hasCommitsToPush(exec, localPath))) {
    return { success: true, message: `[${repoName}] has no memory changes to push`, updated: false };
  }

  const pushResult = await gitExec(exec, localPath, ['push']);
  if (pushResult.timeout) {
    return { success: false, message: GIT_TIMEOUT_MESSAGE };
  }
  if (!pushResult.success) {
    return { success: false, message: pushResult.stdout || 'Push failed' };
  }

  return {
    success: true,
    message: `[${repoName}] pushed memory changes`,
    updated: true,
  };
}
