# pi-context Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Create a production-oriented monorepo scaffold for `pi-context`, move toward a `pi-memory-md`-based Pi package adapter, and establish a harness-agnostic `pi-memory-core` package boundary for future extraction and feature growth.

**Architecture:** Build a root workspace at `D:/Github/pi-context`, preserve existing source repositories as reference inputs during bootstrap, create `packages/pi-context` as the future Pi package shell, create `packages/pi-memory-core` as the future shared engine shell, and wire workspace build/test/config/docs paths before code migration. Keep behavioral changes out of this phase; this phase is about repo shape, package boundaries, and safe extraction staging.

**Tech Stack:** Node.js, npm workspaces, TypeScript, Pi package manifest conventions, markdown docs, existing `pi-memory-md` code as source scaffold.

---

## Phase 1: Root workspace bootstrap

### Task 1: Create root package manifest

**TDD scenario:** Trivial change — use judgment

**Files:**
- Create: `package.json`

**Step 1: Create root workspace manifest**

Write `D:/Github/pi-context/package.json` with:

```json
{
  "name": "pi-context-workspace",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspace @pi-context/pi-memory-core && npm run build --workspace pi-context",
    "typecheck": "npm run typecheck --workspace @pi-context/pi-memory-core && npm run typecheck --workspace pi-context",
    "test": "npm run test --workspace @pi-context/pi-memory-core && npm run test --workspace pi-context",
    "lint": "npm run lint --workspace @pi-context/pi-memory-core && npm run lint --workspace pi-context"
  }
}
```

**Step 2: Verify file exists and JSON is valid**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('ok')"
```

Expected: `ok`

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add workspace root manifest"
```

### Task 2: Create shared TypeScript base config

**TDD scenario:** Trivial change — use judgment

**Files:**
- Create: `tsconfig.base.json`

**Step 1: Create shared TypeScript config**

Write:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "types": ["node"]
  }
}
```

**Step 2: Validate JSON**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('tsconfig.base.json','utf8')); console.log('ok')"
```

Expected: `ok`

**Step 3: Commit**

```bash
git add tsconfig.base.json
git commit -m "chore: add shared tsconfig base"
```

### Task 3: Add root gitignore and workspace docs shell

**TDD scenario:** Trivial change — use judgment

**Files:**
- Create: `.gitignore`
- Create: `README.md`

**Step 1: Create root `.gitignore`**

Include:

```gitignore
node_modules/
dist/
coverage/
*.tsbuildinfo
.DS_Store
```

**Step 2: Create root README**

Document:
- workspace purpose
- package overview
- current bootstrap state
- note that `magic-context`, `pi-memory`, and `pi-memory-md` are reference inputs, not final package layout

**Step 3: Sanity check files**

Run:

```bash
node -e "const fs=require('fs'); ['.gitignore','README.md'].forEach(f=>console.log(f, fs.existsSync(f)))"
```

Expected: both `true`

**Step 4: Commit**

```bash
git add .gitignore README.md
git commit -m "docs: add workspace bootstrap docs"
```

---

## Phase 2: Package scaffolding

### Task 4: Create `packages/pi-memory-core` package shell

**TDD scenario:** Trivial change — use judgment

**Files:**
- Create: `packages/pi-memory-core/package.json`
- Create: `packages/pi-memory-core/tsconfig.json`
- Create: `packages/pi-memory-core/src/index.ts`
- Create: `packages/pi-memory-core/src/config/index.ts`
- Create: `packages/pi-memory-core/src/models/index.ts`
- Create: `packages/pi-memory-core/tests/smoke.test.ts`
- Create: `packages/pi-memory-core/README.md`

**Step 1: Create package manifest**

Use:

```json
{
  "name": "@pi-context/pi-memory-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Harness-agnostic memory core for pi-context.",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "node --test",
    "lint": "node -e \"console.log('lint placeholder: pi-memory-core')\""
  },
  "devDependencies": {
    "@types/node": "^22.15.21",
    "typescript": "^5.8.3"
  }
}
```

**Step 2: Create TypeScript config**

Use root base config and output to `dist/`.

**Step 3: Create minimal exports**

`src/index.ts` should export placeholders from `config` and `models` only.

**Step 4: Add smoke test**

Minimal node test that imports the public entry and asserts exported object shape exists.

**Step 5: Run test to verify it passes**

Run:

```bash
npm run test --workspace @pi-context/pi-memory-core
```

Expected: PASS

**Step 6: Run typecheck**

Run:

```bash
npm run typecheck --workspace @pi-context/pi-memory-core
```

Expected: PASS

**Step 7: Commit**

```bash
git add packages/pi-memory-core
git commit -m "chore: scaffold pi-memory-core package"
```

### Task 5: Create `packages/pi-context` package shell

**TDD scenario:** Trivial change — use judgment

**Files:**
- Create: `packages/pi-context/package.json`
- Create: `packages/pi-context/tsconfig.json`
- Create: `packages/pi-context/src/index.ts`
- Create: `packages/pi-context/src/bootstrap/index.ts`
- Create: `packages/pi-context/src/hooks/index.ts`
- Create: `packages/pi-context/src/tools/index.ts`
- Create: `packages/pi-context/skills/memory-init/SKILL.md`
- Create: `packages/pi-context/skills/memory-import/SKILL.md`
- Create: `packages/pi-context/skills/memory-write/SKILL.md`
- Create: `packages/pi-context/README.md`
- Create: `packages/pi-context/tests/smoke.test.ts`

**Step 1: Create package manifest**

Base this on `pi-memory-md` shape, but adapted for workspace:

- package name: `pi-context`
- `type: module`
- `pi.extensions` points to built entry or source entry based on chosen packaging workflow
- `pi.skills` points to three starter skill files
- depend on `@pi-context/pi-memory-core`
- include peer dependency on `@mariozechner/pi-coding-agent`

**Step 2: Create minimal adapter exports**

`src/index.ts` should export a placeholder bootstrap surface and import no Pi runtime yet beyond types if needed.

**Step 3: Add starter skill files**

Use concise placeholders that document future purpose and explicitly mark them as scaffolds.

**Step 4: Add smoke test**

Minimal test that imports `src/index.ts` public surface and asserts module shape.

**Step 5: Run test to verify it passes**

Run:

```bash
npm run test --workspace pi-context
```

Expected: PASS

**Step 6: Run typecheck**

Run:

```bash
npm run typecheck --workspace pi-context
```

Expected: PASS

**Step 7: Commit**

```bash
git add packages/pi-context
git commit -m "chore: scaffold pi-context package"
```

---

## Phase 3: Extraction staging and source import preparation

### Task 6: Create migration inventory docs

**TDD scenario:** Trivial change — use judgment

**Files:**
- Create: `docs/plans/2026-05-06-pi-context-migration-inventory.md`

**Step 1: Write migration inventory**

Document exact first extraction targets from `pi-memory-md`:

Move later into `pi-memory-core`:
- `memory-core.ts`
- `memory-git.ts`
- `types.ts`
- `utils.ts`
- tape domain files after interface cleanup

Keep/adapt in `pi-context`:
- `index.ts`
- `tools.ts`
- Pi lifecycle bridging
- Pi package manifest
- skills

Document exact first concept imports from `pi-memory`:
- candidate extraction
- consolidation prompts/logic
- lesson and preference model ideas

Document exact first concept imports from `magic-context`:
- ranking strategy inputs
- context assembly boundaries
- orchestration adapter separation

**Step 2: Review doc for clarity**

Run:

```bash
node -e "const fs=require('fs'); const t=fs.readFileSync('docs/plans/2026-05-06-pi-context-migration-inventory.md','utf8'); console.log(t.includes('pi-memory-md'), t.includes('pi-memory'), t.includes('magic-context'))"
```

Expected: `true true true`

**Step 3: Commit**

```bash
git add docs/plans/2026-05-06-pi-context-migration-inventory.md
git commit -m "docs: add migration inventory for pi-context"
```

### Task 7: Create public interface contracts before code movement

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `packages/pi-memory-core/src/models/contracts.ts`
- Create: `packages/pi-memory-core/tests/contracts.test.ts`
- Modify: `packages/pi-memory-core/src/index.ts`

**Step 1: Write the failing test**

Add a test that imports core contracts and asserts the package exports named contract groups for:
- config
- storage
- retrieval
- consolidation
- review
- tape

Example:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/index.js';

test('core exports contract surface', () => {
  assert.ok(core.contracts);
  assert.ok(core.contracts.memoryDocumentKinds);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @pi-context/pi-memory-core
```

Expected: FAIL because `contracts` export missing

**Step 3: Write minimal implementation**

Create `contracts.ts` with:
- memory document kind constants
- queue status constants
- retrieval mode constants
- confidence bucket constants
- minimal interface type exports

Export them via `src/index.ts`.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test --workspace @pi-context/pi-memory-core
```

Expected: PASS

**Step 5: Run typecheck**

Run:

```bash
npm run typecheck --workspace @pi-context/pi-memory-core
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/pi-memory-core/src packages/pi-memory-core/tests
git commit -m "feat: add core public contracts scaffold"
```

### Task 8: Create adapter boundary contracts in `pi-context`

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `packages/pi-context/src/adapters/contracts.ts`
- Create: `packages/pi-context/tests/adapter-contracts.test.ts`
- Modify: `packages/pi-context/src/index.ts`

**Step 1: Write the failing test**

Test should assert `pi-context` exports adapter contract metadata for:
- hook bridge
- tool bridge
- command bridge
- skill packaging bridge

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace pi-context
```

Expected: FAIL because adapter contract export missing

**Step 3: Write minimal implementation**

Add `contracts.ts` describing the adapter boundary and export it from package entry.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test --workspace pi-context
```

Expected: PASS

**Step 5: Run typecheck**

Run:

```bash
npm run typecheck --workspace pi-context
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/pi-context/src packages/pi-context/tests
git commit -m "feat: add pi-context adapter contracts scaffold"
```

---

## Phase 4: Workspace verification

### Task 9: Install dependencies and verify whole workspace

**TDD scenario:** Modifying tested code — run existing tests first

**Files:**
- Modify: `package-lock.json` or generated lockfile

**Step 1: Install workspace dependencies**

Run:

```bash
npm install
```

Expected: workspace dependencies installed successfully

**Step 2: Run workspace tests**

Run:

```bash
npm test
```

Expected: PASS for both packages

**Step 3: Run workspace typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS

**Step 4: Optionally run workspace build**

Run:

```bash
npm run build
```

Expected: PASS or clear placeholder build success

**Step 5: Commit**

```bash
git add package-lock.json
git commit -m "chore: install workspace dependencies"
```

---

## Phase 5: Preparation checkpoint for code migration

### Task 10: Write extraction-ready checkpoint note

**TDD scenario:** Trivial change — use judgment

**Files:**
- Create: `docs/plans/2026-05-06-pi-context-execution-checkpoint.md`

**Step 1: Document checkpoint**

Include:
- scaffold complete
- workspace builds/tests/typechecks
- source repos still intact as references
- next implementation sequence for actual extraction
- first extraction candidate list from `pi-memory-md`
- known risks: Windows path normalization, package manifest correctness, peer dependency boundaries

**Step 2: Review checkpoint**

Run:

```bash
node -e "const fs=require('fs'); const p='docs/plans/2026-05-06-pi-context-execution-checkpoint.md'; console.log(fs.existsSync(p), fs.readFileSync(p,'utf8').includes('Windows path normalization'))"
```

Expected: `true true`

**Step 3: Commit**

```bash
git add docs/plans/2026-05-06-pi-context-execution-checkpoint.md
git commit -m "docs: add extraction checkpoint for pi-context"
```

---

## Notes for the engineer executing this plan

- Do not delete the existing `magic-context`, `pi-memory`, or `pi-memory-md` reference directories during this phase.
- Do not import large upstream files blindly into the new packages yet.
- Establish contracts and package boundaries before moving behavior.
- Keep the first execution phase focused on structure, not feature parity.
- When extraction starts, favor moving stable low-level helpers from `pi-memory-md` into `pi-memory-core` before moving Pi-facing runtime logic.
- Cross-platform path handling is a production requirement from day one.

---

## Suggested next plan after this one

After this scaffold plan completes, write a second implementation plan for:

1. extracting markdown/git/types/util layers from `pi-memory-md`
2. adapting Pi runtime shell into `packages/pi-context`
3. introducing SQLite operational schema
4. introducing candidate extraction and review queue skeleton
5. adding first end-to-end integration tests
