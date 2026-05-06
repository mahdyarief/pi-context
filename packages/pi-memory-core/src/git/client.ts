import type { GitResult } from '../types.js';

export type GitExecOptions = {
  cwd?: string;
  signal?: AbortSignal;
};

export type GitExecFn = (
  command: string,
  args: string[],
  options?: GitExecOptions,
) => Promise<{ stdout?: string }>;

export const DEFAULT_GIT_TIMEOUT_MS = 10000;

export async function gitExec(
  exec: GitExecFn,
  cwd: string,
  args: string[],
  timeoutMs = DEFAULT_GIT_TIMEOUT_MS,
): Promise<GitResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await exec('git', args, { cwd, signal: controller.signal });
    return { stdout: result.stdout || '', success: true };
  } catch (error) {
    const err = error as { name?: string; code?: string; message?: string };
    const isTimeout = err?.name === 'AbortError' || err?.code === 'ABORT_ERR';

    if (isTimeout) {
      return { stdout: '', success: false, timeout: true };
    }

    return { stdout: err?.message || String(error), success: false };
  } finally {
    clearTimeout(timeoutId);
  }
}
