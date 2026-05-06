# pi-context Extraction Phase Plan

**Date:** 2026-05-06  
**Goal:** Execute actual code extraction from `pi-memory-md` into workspace packages with minimal risk, preserving behavior while establishing clean package boundaries.

## Status at start

Completed before this plan:
- workspace scaffold exists
- package install works
- package-local tests pass with `tsx`
- package-local typecheck passes
- package-local build passes
- first low-risk extraction slice started by moving real skill content and helper scripts/templates into `packages/pi-context/skills`

## Status snapshot after current extraction slices

Completed now:
- `packages/pi-memory-core` owns extracted:
  - shared types
  - utilities
  - settings normalization
  - memory file/context/meta logic
  - git sync/push helpers
  - hook normalization/execution helpers
  - tape gate primitives
- `packages/pi-context` owns working Pi adapter slices for:
  - extension export and lifecycle wiring
  - startup memory delivery
  - memory commands/tools
    - `memory-check` includes initialization/repo status summary plus simple tree output
  - tape gating
  - persisted file-backed tape anchor storage
  - `tape_handoff`
  - `tape_list`
  - `tape_info`
  - `tape_delete`
  - `tape_search`
  - `tape_read`
  - `tape_reset`
  - `memory-anchor`
  - minimal `memory-review` summary shell
    - session-scoped
    - excludes `session/*` anchors from summary counts/lists
    - clamps requested limits
    - reports explicit unavailable error when tape runtime is off
  - minimal session-start `session/new` / `session/resume` anchor recording
  - minimal session tree label sync for handoff/start/delete/reset
  - tape context delivery in both adapter delivery modes
  - minimal smart tape context selection over referenced project files with whitelist/blacklist, ignored-path filtering, configured `memoryScan` time windows, and recent conversation excerpts
- verification currently passes for:
  - `pi-context` test/typecheck/build
  - `@pi-context/pi-memory-core` test/build

Still remaining:
- full parity port of `pi-memory-md/index.ts`
- full tape runtime/service parity
- advanced session tree replay/reconfigure label parity
- advanced tape context ranking/scoring parity
- deeper smart tape parity beyond current windowed references + minimal conversation excerpts
- conversation excerpt / tape conversation injection parity
- full `memory-review` overlay parity and heavier TUI parity
- migration inventory cleanup as extraction advances

Known environment issue:
- nested `npm`/`node` resolution under spawned `cmd.exe` is unreliable on this Windows setup
- direct `node npm-cli.js ...` invocation works reliably for verification
- do not treat this as package bug until reproduced outside harness

## Extraction principles

1. Move lowest-risk, least Pi-coupled code first.
2. Preserve behavior before redesign.
3. Keep `pi-memory-md` as reference source during whole phase.
4. Extract to `@pi-context/pi-memory-core` when code is harness-agnostic.
5. Keep Pi runtime registration, commands, tool wiring, and skill packaging in `pi-context`.
6. Add or update tests at each boundary before broad rewrites.
7. Prefer small compatibility shims over large rewrites.

## Target package split

### `@pi-context/pi-memory-core`
Owns:
- settings normalization
- path and project metadata helpers
- memory file parsing
- memory directory discovery
- memory context assembly
- memory metadata listing
- low-level git wrappers only if made harness-agnostic
- reusable domain types/constants/contracts

Does not own yet:
- Pi extension registration
- Pi command registration
- Pi tool registration
- Pi TUI rendering
- Tape UI overlays tightly coupled to Pi

### `pi-context`
Owns:
- extension entrypoint
- lifecycle event wiring
- hook orchestration against Pi runtime
- tool registration and rendering
- slash command registration
- skill packaging
- adapter contracts for future alternative harnesses
- temporary compatibility layer while core extraction stabilizes

## Phase A — Core type and utility extraction

### Task A1: Extract `types.ts` into `packages/pi-memory-core/src/types.ts`
- Copy `pi-memory-md/types.ts` into core package.
- Update imports inside copied file to remain local to core package.
- Export from `packages/pi-memory-core/src/index.ts`.
- Add test proving selected public types/constants load through package entry.
- Verify: test, typecheck, build for core.

### Task A2: Extract `utils.ts` into `packages/pi-memory-core/src/utils.ts`
- Copy file with smallest necessary edits.
- Remove Pi-only assumptions if any; keep behavior same.
- Add focused tests for:
  - home path expansion
  - path safety helpers
  - project metadata detection
  - tape base path helpers if still utility-level
- Verify: core test/typecheck/build.

### Task A3: Extract settings + memory file logic from `memory-core.ts`
- Split copied code into:
  - `src/config/settings.ts`
  - `src/memory/files.ts`
  - `src/memory/context.ts`
  - `src/memory/meta.ts`
- Keep exports stable via `src/index.ts` barrel.
- Do not move tape-specific logic yet if it drags Pi-only dependencies.
- Add tests for:
  - `loadSettings` normalization
  - `getMemoryDir` / `getGlobalMemoryDir`
  - `readMemoryFileAsync`
  - `listMemoryFilesAsync`
  - `buildMemoryContextAsync`
- Verify all core commands.

## Phase B — Git and hook boundary cleanup

### Task B1: Inspect `memory-git.ts` for harness coupling
- Separate pure git execution/data logic from Pi notification behavior.
- Create core candidate module, likely:
  - `src/git/client.ts`
  - `src/git/sync.ts`
- If direct Pi API dependency remains, keep thin wrapper in `pi-context`.
- Add tests around status parsing, fetch/pull freshness logic, and dirty repo behavior.

### Task B2: Move hook normalization to core, keep hook execution in adapter
- Extract from `hooks.ts`:
  - defaults
  - normalization
  - hook action list resolution
- Keep actual runtime callback execution in `pi-context`.
- Add tests for legacy config normalization.

## Phase C — Adapter shell implementation in `pi-context`

### Task C1: Replace scaffold entry with compatibility adapter
- Introduce modules:
  - `src/adapters/runtime.ts`
  - `src/adapters/hooks.ts`
  - `src/adapters/commands.ts`
  - `src/adapters/tools.ts`
- Start by porting current `pi-memory-md/index.ts` behavior with imports redirected to core.
- Maintain placeholder exports only where real runtime behavior not yet ported.

### Task C2: Port memory tools
- Port `memory_sync`, `memory_list`, `memory_search`, `memory_check` from `pi-memory-md/tools.ts`.
- Keep render helpers in `pi-context`.
- Import core services for file/meta/path operations.
- Add adapter tests where possible; otherwise verify with typecheck/build and targeted smoke tests.

### Task C3: Port slash commands
- Port `/memory-refresh` and `/memory-check` command logic.
- Keep `memory-init` as skill-driven, not command-driven.

## Phase D — Tape extraction staging

### Task D1: Inventory tape modules by coupling level
Classify each file as:
- core-ready
- adapter-boundary
- Pi-TUI-bound

Initial expectation:
- likely core-ready: `tape-types`, parts of gate/search/read logic
- likely adapter-boundary: tool registration, service integration
- likely Pi-TUI-bound: review overlay UI

### Task D2: Extract non-UI tape primitives to core
- Move tape data types and pure search/read/filter helpers first.
- Delay review UI migration until non-UI pieces pass tests.

## Phase E — Documentation and contract updates

### Task E1: Update package READMEs
- `packages/pi-memory-core/README.md`: what is stable vs internal.
- `packages/pi-context/README.md`: current adapter scope, packaged skills, relation to upstream extraction.

### Task E2: Update migration inventory
- record each completed move
- record remaining upstream files
- note intentional divergences from `pi-memory-md`
- keep package README reference paths current so future sessions know the exact upstream source files

## Verification strategy per slice

For each extraction slice run:
1. package-local test
2. package-local typecheck
3. package-local build
4. if adapter code changed, run `pi-context` smoke tests too

Recommended commands on this machine:

```bash
"C:\Users\Lenovo\nvm\nodejs\node.exe" "C:\Users\Lenovo\nvm\nodejs\node_modules\npm\bin\npm-cli.js" run test --workspace @pi-context/pi-memory-core
"C:\Users\Lenovo\nvm\nodejs\node.exe" "C:\Users\Lenovo\nvm\nodejs\node_modules\npm\bin\npm-cli.js" run test --workspace pi-context
"C:\Users\Lenovo\nvm\nodejs\node.exe" "C:\Users\Lenovo\nvm\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck --workspace @pi-context/pi-memory-core
"C:\Users\Lenovo\nvm\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck --workspace pi-context
```

## Immediate next recommended execution order

1. Keep README and migration inventory aligned as slices land.
2. Decide whether current adapter-local tape seams should remain local or move into core:
   - `src/tape/store.ts`
   - `src/tape/reader.ts`
   - `src/tape/context.ts`
3. Decide whether to keep the current `memory-review` summary shell or grow it toward overlay parity next.
4. If tape context quality still needs work, continue with:
   - `memoryScan`-window-aware smart filtering
   - conversation excerpt injection
   - smarter ranking/scoring parity only if justified
5. Defer broader TUI-heavy parity until after non-UI runtime parity is solid.

## Risks

- hidden Pi runtime assumptions inside `memory-git.ts` and `tools.ts`
- Windows shell/path behavior masking package/runtime bugs
- tape modules pulling too much UI coupling too early
- scope creep from mixing extraction with redesign

## Non-goals for this phase

- SQLite schema work
- candidate extraction pipeline from `pi-memory`
- ranking/orchestration import from `magic-context`
- feature expansion beyond parity-preserving extraction

## Definition of done for extraction phase

- core package owns non-Pi memory domain logic from `pi-memory-md`
- pi-context package owns working Pi adapter surface
- key skills ship from `packages/pi-context/skills`
- non-UI tape runtime flows are production-usable without depending on upstream package
- package-local tests/typecheck/build pass
- migration inventory updated with remaining tape/UI work
