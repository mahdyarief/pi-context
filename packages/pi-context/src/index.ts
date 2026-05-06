import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { registerAdapterShell } from './bootstrap/index.js';

export * as bootstrap from './bootstrap/index.js';
export * as hooks from './hooks/index.js';
export * as tools from './tools/index.js';
export * as tape from './tape/index.js';

export const packageInfo = {
  name: 'pi-context',
  stage: 'adapter-shell',
} as const;

export default function piContextExtension(pi: ExtensionAPI): void {
  registerAdapterShell(pi);
}
