# pi-context

Pi adapter and installable package for the `pi-context` workspace.

## Current status

Extraction is active and the package is no longer just scaffold.

Implemented in `packages/pi-context` now:
- Pi adapter shell / default extension export
- lifecycle wiring for:
  - `before_agent_start`
  - `session_start`
  - `session_shutdown`
  - `tool_call` tape gating
- memory commands:
  - `memory-refresh`
  - `memory-check`
  - `memory-anchor`
  - `memory-review`
- memory tools:
  - `memory_sync`
  - `memory_list`
  - `memory_search`
  - `memory_check`
- tape tools:
  - `tape_handoff`
  - `tape_list`
  - `tape_info`
  - `tape_delete`
  - `tape_search`
  - `tape_read`
  - `tape_reset`
- working non-UI tape runtime behavior:
  - keyword handoff detection/message queueing
  - manual-mode `tape_handoff` blocking
  - manual `/memory-anchor` queueing
  - minimal `/memory-review` summary shell
  - session-scoped
  - excludes `session/*` anchors from summary counts/lists
  - clamps requested limits
  - returns explicit unavailable error when tape runtime is off
  - persisted JSONL anchor storage
  - session-start automatic `session/new` / `session/resume` anchors
  - minimal session tree label sync for handoff/start/delete/reset flows
  - tape context delivery in:
    - `message-append`
    - `system-prompt`
  - smart tape context selection with:
    - recent referenced project files
    - whitelist/blacklist support
    - newer-reference-first ranking
    - common ignored-path filtering
    - fallback to recent memory files
- packaged skills restored for:
  - `memory-init`
  - `memory-import`
  - `memory-write`
- packaged shell/scripts/templates restored for memory initialization flows

Shared harness-agnostic logic has been extracted into `packages/pi-memory-core`.

## Package split during migration

### `packages/pi-context`
Owns Pi-facing runtime integration:
- extension entrypoint
- lifecycle event wiring
- Pi tool registration
- Pi command registration
- packaged skills
- temporary adapter-local tape runtime seams

### `packages/pi-memory-core`
Owns shared non-Pi logic:
- settings normalization
- memory file parsing/listing/context/meta
- git sync/push helpers with injected exec
- hook normalization/runner helpers
- reusable tape gate primitives
- common types/utilities

## Current parity map

### Ported enough to use now
- memory delivery on startup
- memory refresh/check commands
  - `memory-check` now reports initialization/repo status and emits a simple memory tree summary
- manual `memory-anchor` command
- minimal `memory-review` summary command
  - honest summary fallback, not overlay parity yet
- non-UI memory tools
- non-UI tape anchor tools
- non-UI tape search/read/reset tools
- minimal lifecycle hook orchestration
- minimal tape session-start anchor recording
- minimal session tree label sync
- tape context delivery in both adapter delivery modes
- minimal smart tape context selection for referenced project files
  - honors configured `tape.context.memoryScan` time windows before falling back to older session references
  - injects a small recent conversation excerpt from visible session entries

### Still intentionally incomplete
- full parity port of `pi-memory-md/index.ts`
- full session-tree replay/reconfigure label parity
- advanced tape context ranking/scoring parity
- deeper smart tape parity beyond current windowed references + minimal conversation excerpts
- conversation excerpt / tape conversation injection parity
- full `memory-review` overlay parity
- full tape review/analyze/context UI parity
- broader TUI-heavy behavior

## Packaged skills

- `skills/memory-init/SKILL.md`
- `skills/memory-import/SKILL.md`
- `skills/memory-write/SKILL.md`

## Reference implementation during migration

Until extraction completes, `pi-memory-md/` remains the upstream reference.

Primary reference paths:
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

Use those files as behavior reference first; do not redesign just because extraction is in progress.

## Current adapter-local tape seams

These are real production slices, but still adapter-local for now:
- `src/tape/store.ts` — persisted JSONL anchor store
- `src/tape/reader.ts` — minimal session-file reader/search support
- `src/tape/index.ts` — tape tool registration + session-start/session-label helpers
- `src/tape/context.ts` — minimal tape context builder / smart file selector

They should stay local unless duplication pressure proves a core extraction is worthwhile.
