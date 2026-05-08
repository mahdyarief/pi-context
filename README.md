# pi-context

`pi-context` is a Pi package for git-backed markdown memory, startup memory delivery, and file-backed tape anchors/context, ready for practical non-UI use today.

The workspace is split into:

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

Current posture: **stable core, installable Pi adapter, some advanced UI parity still missing**.

Ready now:

- install/load works
- memory commands/tools work
- tape anchor/search/read/reset tools work
- git-backed sync/push flow works

Still intentionally incomplete versus upstream `pi-memory-md`:

- full overlay/UI parity
- full tape-service parity
- full advanced context-ranking parity
- full session-tree replay/reconfigure parity

Verification scripts available at workspace root:

```bash
npm run build
npm run typecheck
npm run test
npm run lint
```

Note: current lint scripts are placeholder-only pass-through checks, so treat lint output honestly.

## Install

Pi supports installing directly from this GitHub repo:

```bash
pi install https://github.com/mahdyarief/pi-context
```

You can also manage it later with normal Pi package commands:

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

## Ready-to-use flow

After install, `pi-context` needs a GitHub memory repository URL in `pi-context.repoUrl`.

If `repoUrl` is missing, `pi-context` now warns clearly that it is installed but not ready yet, and tells the user to:

1. add `pi-context.repoUrl` in settings
2. run `/memory-init`

That means the expected first-time flow is:

1. install `pi-context`
2. create or choose a GitHub repo for memory
3. set `pi-context.repoUrl`
4. run `/memory-init`
5. verify with `/memory-check`
6. start using memory normally

## First-time setup

After config, initialize project memory:

- use the packaged `memory-init` skill
- or run the equivalent init flow in Pi

Then verify:

- `/memory-check`
- `/memory-refresh`

When ready, push memory changes with `memory_sync`.

## Usage examples

### Check current memory status

```text
/memory-check
```

Typical use:
- confirms whether memory is initialized
- shows repo status
- shows a small memory tree summary

### Refresh memory into the current session

```text
/memory-refresh
```

Typical use:
- after editing memory files manually
- after pulling memory changes
- after initializing a new project memory folder

### Review recent anchors quickly

```text
/memory-review
/memory-review 10
```

Typical use:
- see recent non-session anchors
- get a compact session-oriented summary
- inspect recent handoff history without opening files directly

### Ask for a manual anchor

```text
/memory-anchor summarize release decision and open risks
```

Typical use:
- force a durable anchor for a milestone or decision
- create a handoff point before context switches

### Inspect the memory repo from tools

Examples of tool intents inside Pi:

- `memory_check` — inspect memory folder structure
- `memory_list` — list files under memory
- `memory_search` — search frontmatter or markdown content
- `memory_sync` with `status` — inspect repo state
- `memory_sync` with `push` — push saved memory changes
- `memory_sync` with `pull` — pull latest memory changes

## Compatibility note for pi-memory-md users

`pi-context` cannot be used in parallel with `git:github.com/VandeeFeng/pi-memory-md`.

They register overlapping memory tools/commands, so running both at the same time causes conflicts.

## Package layout

- `packages/pi-context/` — installable Pi package implementation
- `packages/pi-memory-core/` — stable shared core logic
- `pi-memory-md/` — upstream reference used for parity checks where still helpful

## Upstream reference

Behavior is still compared against these source-of-truth files where parity work is still in progress:

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
