import { getMemoryMeta, gitExec, listMemoryFilesAsync, type MemoryMdSettings } from '@pi-context/pi-memory-core';

export const MISSING_REPO_URL_MESSAGE =
  'pi-context is installed but pi-context.repoUrl is missing. Add your GitHub memory repository URL in settings, then run /memory-init.';

type PiExec = (command: string, args: string[], options?: { cwd?: string; signal?: AbortSignal }) => Promise<{ stdout: string }>;

export async function renderMemoryTree(memoryPath: string, maxLines = 25): Promise<string> {
  const files = (await listMemoryFilesAsync(memoryPath))
    .map((filePath) => filePath.slice(memoryPath.length).replace(/^[/\\]/, '').split('\\').join('/'))
    .filter(Boolean)
    .sort();
  const lines = files.slice(0, Math.max(1, maxLines)).map((filePath) => `- ${filePath}`);
  if (files.length > lines.length) lines.push(`... (${files.length - lines.length} more)`);
  return lines.join('\n') || '(no memory files found)';
}

export async function buildMemoryCheckNotifications(
  settings: MemoryMdSettings,
  cwd: string,
  exec: PiExec,
  args: string,
): Promise<Array<{ message: string; level: 'info' | 'warning' }>> {
  const info = await getMemoryMeta(settings, cwd);

  if (!info.initialized && !settings.repoUrl?.trim()) {
    return [
      {
        message: `Memory: ${info.name} | Repo URL: Missing | Add pi-context.repoUrl, then run /memory-init | Path: ${info.memoryPath}`,
        level: 'warning',
      },
      {
        message: MISSING_REPO_URL_MESSAGE,
        level: 'warning',
      },
    ];
  }

  if (!info.initialized) {
    return [
      {
        message: `Memory: ${info.name} | Repo: Not initialized | Use /memory-init to set up | Path: ${info.memoryPath}`,
        level: 'info',
      },
    ];
  }

  const statusResult = settings.localPath
    ? await gitExec(exec, settings.localPath, ['status', '--porcelain'])
    : { stdout: '', success: false };
  const isDirty = statusResult.stdout.trim().length > 0;
  const repoStatus = settings.localPath ? (isDirty ? 'Uncommitted changes' : 'Clean') : 'Not configured';
  const requestedTreeOutputLines = Number.parseInt(args.trim(), 10);
  const maxTreeOutputLines = Number.isFinite(requestedTreeOutputLines) && requestedTreeOutputLines > 0 ? requestedTreeOutputLines : 25;

  return [
    {
      message: `Memory: ${info.name} | Repo: ${repoStatus} | Files: ${info.project.fileCount ?? 0} | Path: ${info.memoryPath}`,
      level: isDirty ? 'warning' : 'info',
    },
    {
      message: await renderMemoryTree(info.memoryPath, maxTreeOutputLines),
      level: 'info',
    },
  ];
}
