# pi-context

`pi-context` is a Pi package for git-backed markdown memory, startup memory delivery, and file-backed tape anchors/context.

It is the successor/migration target for `pi-memory-md`, split into:

- `packages/pi-context` — Pi-facing extension/package surface
- `packages/pi-memory-core` — shared harness-agnostic memory logic

## What it does

After install and config, `pi-context` can:

- inject memory context on session start
- keep memory in a git repository
- provide memory tools:
  - `memory_sync`
  - `memory_list`
  - `memory_search`
  - `memory_check`
- provide memory commands:
  - `/memory-refresh`
  - `/memory-check`
  - `/memory-review`
  - `/memory-anchor`
- provide tape tools:
  - `tape_handoff`
  - `tape_list`
  - `tape_info`
  - `tape_delete`
  - `tape_search`
  - `tape_read`
  - `tape_reset`

## Current status

This package is ready for practical non-UI use in Pi now:

- install/load works
- memory commands/tools work
- tape anchor/search/read/reset tools work
- git-backed sync/push flow works

Still intentionally incomplete versus upstream `pi-memory-md`:

- full overlay/UI parity
- full tape-service parity
- full advanced context-ranking parity
- full session-tree replay/reconfigure parity

## Install

Pi supports installing directly from this GitHub repo:

```bash
pi install https://github.com/mahdyarief/pi-context
```

You can also pin/update later with normal Pi package commands:

```bash
pi list
pi update
pi remove https://github.com/mahdyarief/pi-context
```

## Configure

Add a `pi-context` block to `~/.pi/agent/settings.json`.

Example:

```json
{
  "packages": [
    "https://github.com/mahdyarief/pi-context"
  ],
  "pi-context": {
    "enabled": true,
    "repoUrl": "https://github.com/mahdyarief/agent-pi-memory.git",
    "localPath": "~/.pi/memory-md",
    "delivery": "message-append",
    "hooks": {
      "sessionStart": ["pull"],
      "sessionEnd": ["push"]
    },
    "tape": {
      "enabled": true,
      "onlyGit": false,
      "context": {
        "strategy": "smart",
        "fileLimit": 8,
        "memoryScan": [72, 168]
      }
    }
  }
}
```

## First-time setup

After config, initialize project memory:

- use the packaged `memory-init` skill
- or run the equivalent init flow in Pi

Then verify:

- `/memory-check`
- `/memory-refresh`

When ready, push memory changes with `memory_sync`.

## Notes on migration from pi-memory-md

If `pi-memory-md` is still installed, remove it first to avoid tool-name collisions.

Typical cleanup:

```bash
pi remove git:github.com/VandeeFeng/pi-memory-md
```

Then install `pi-context`.

## Package layout

- `packages/pi-context/` — active Pi package implementation
- `packages/pi-memory-core/` — shared core logic
- `pi-memory-md/` — upstream reference during migration

## Upstream reference during migration

Behavior is still compared against these source-of-truth files:

- `pi-memory-md/index.ts`
- `pi-memory-md/tools.ts`
- `pi-memory-md/hooks.ts`
- `pi-memory-md/memory-core.ts`
- `pi-memory-md/memory-git.ts`
- `pi-memory-md/tape/tape-gate.ts`
- `pi-memory-md/tape/tape-tools.ts`
- `pi-memory-md/tape/tape-reader.ts`
- `pi-memory-md/tape/tape-service.ts`
- `pi-memory-md/tape/tape-anchor.ts`
- `pi-memory-md/tests/`
