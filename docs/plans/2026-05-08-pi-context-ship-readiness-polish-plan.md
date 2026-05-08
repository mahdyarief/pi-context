# pi-context Ship-Readiness Polish Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Promote `pi-context` and `@pi-context/pi-memory-core` from scaffold/migration-heavy wording to honest ship-ready wording, then verify build/typecheck/test/lint still pass.

**Architecture:** This is a documentation-and-metadata truthfulness pass, not a behavioral feature change. Keep runtime behavior unchanged except for package metadata strings and tests that assert those strings. Use the strongest honest posture: stable core, some advanced UI parity still missing.

**Tech Stack:** npm workspaces, TypeScript, Node.js built-in test runner, markdown package docs

---

## Current evaluation

`pi-context` looks closer to **ready to publish for practical non-UI use** than "still scaffold," but not fully parity-complete with upstream `pi-memory-md`.

Best honest release posture for this repo right now:
- **stable core, some advanced UI parity missing**

Why this is the smallest honest posture:
- root workspace already builds, typechecks, and has package-level tests
- top-level README already says practical non-UI use is ready now
- package docs and smoke tests still carry stale scaffold/migration wording
- `@pi-context/pi-memory-core` metadata still says `stage: "scaffold"`
- lint scripts are placeholder echoes, so docs must not overclaim rigorous lint enforcement

Conclusion:
- **Ready to ship** for practical use after this polish pass and full verification
- **Ready to publish** only with wording that explicitly avoids claiming full upstream parity or real lint coverage

## Scope and constraints

- Do not add new runtime features.
- Do not redesign package APIs.
- Keep code edits minimal and truthfulness-focused.
- Root test command examples must use `npm run test`, not `npm test`.
- Lint may remain placeholder-only, but docs must describe it honestly.
- Prefer updating exact wording/tests over broad README rewrites.

---

### Task 1: Promote `pi-memory-core` package metadata from scaffold to stable-core wording

**TDD scenario:** Modifying tested code — run existing tests first

**Files:**
- Modify: `packages/pi-memory-core/src/index.ts`
- Test: `packages/pi-memory-core/tests/smoke.test.js`

**Step 1: Run existing smoke test first**

Run: `npm run test --workspace @pi-context/pi-memory-core -- smoke.test.js`
Expected: PASS and current assertions show `stage` still equals `scaffold`

**Step 2: Decide exact wording before editing**

Use package metadata that matches the chosen posture and can survive future docs/tests. Prefer a concise stable value such as:

```ts
stage: "stable-core"
```

Reason: it clearly stops calling the package a scaffold while avoiding overclaiming complete parity.

**Step 3: Update package metadata**

Change `packages/pi-memory-core/src/index.ts` so `packageInfo.stage` uses the chosen stable wording.

**Step 4: Update smoke test to match**

In `packages/pi-memory-core/tests/smoke.test.js`, rename the test from scaffold language and assert the new stage value.

Suggested target:

```js
test('pi-memory-core smoke exports stable core surface', async () => {
  const core = await import('../src/index.ts');
  assert.equal(core.packageInfo.name, '@pi-context/pi-memory-core');
  assert.equal(core.packageInfo.stage, 'stable-core');
  assert.ok(core.config.defaultCoreConfig);
  assert.ok(core.models.memoryDocumentKinds);
});
```

**Step 5: Run focused test**

Run: `npm run test --workspace @pi-context/pi-memory-core -- smoke.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/pi-memory-core/src/index.ts packages/pi-memory-core/tests/smoke.test.js
git commit -m "chore: promote pi-memory-core package metadata"
```

---

### Task 2: Promote `pi-context` smoke tests from scaffold wording to ship-ready wording

**TDD scenario:** Modifying tested code — run existing tests first

**Files:**
- Modify: `packages/pi-context/tests/smoke.test.js`
- Modify: `packages/pi-context/tests/adapter.test.js`
- Reference: `packages/pi-context/src/index.ts`
- Reference: `packages/pi-context/src/bootstrap/index.ts`

**Step 1: Run existing adapter-related tests first**

Run: `npm run test --workspace pi-context -- smoke.test.js adapter.test.js`
Expected: PASS and current assertions show `stage` equals `adapter-shell`

**Step 2: Keep package stage wording only if still honest**

Do **not** change runtime code if `adapter-shell` is still the most accurate internal package-stage identifier.

Use this decision rule:
- if `adapter-shell` is only an internal packaging term and docs no longer describe the package as scaffold, leave runtime metadata unchanged
- if it reads as obsolete scaffold-stage wording in public surfaces, promote it to a more honest value such as `stable-adapter`

Given current code, likely smallest safe choice:
- keep `pi-context` runtime metadata unchanged
- only update test names/descriptions so they stop saying scaffold

**Step 3: Update smoke test naming**

Change `packages/pi-context/tests/smoke.test.js` test title from scaffold wording to wording like:

```js
test('pi-context smoke exports adapter package surface', async () => {
```

Keep assertion on `packageInfo.stage` aligned with actual metadata.

**Step 4: Update adapter test naming if needed**

If `packages/pi-context/tests/adapter.test.js` contains user-facing test titles or comments that imply scaffold status, rename them to neutral/ship-ready wording without changing behavior.

**Step 5: Run focused tests**

Run: `npm run test --workspace pi-context -- smoke.test.js adapter.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/pi-context/tests/smoke.test.js packages/pi-context/tests/adapter.test.js
git commit -m "test: remove scaffold wording from pi-context smoke tests"
```

---

### Task 3: Rewrite root README from migration-heavy framing to ship-ready framing

**TDD scenario:** Trivial change — use judgment

**Files:**
- Modify: `README.md`

**Step 1: Read current sections before editing**

Focus on these sections in `README.md`:
- intro paragraph near top
- `## Current status`
- install/config/setup flow
- `## Notes on migration from pi-memory-md`
- `## Package layout`
- `## Upstream reference during migration`

**Step 2: Preserve honest status, reduce migration-first framing**

Update the README so it leads with publishable/use-now framing, not extraction history.

Required content goals:
- say package is usable now for practical non-UI Pi workflows
- keep explicit note that some advanced UI/upstream parity is still missing
- keep conflict warning about not installing alongside `pi-memory-md`
- move migration/extraction history lower in the document or compress it
- avoid language that sounds like this repo is still only a successor target

Suggested posture sentence near top:

```md
`pi-context` is a Pi package for git-backed markdown memory and tape context, ready for practical non-UI use today.
```

Suggested status phrasing:
- stable core package
- installable Pi adapter package
- advanced UI parity still incomplete
- lint scripts currently placeholder-only

**Step 3: Fix root command examples**

Search the root README for any root-level test invocation examples and ensure they use:

```bash
npm run test
```

not:

```bash
npm test
```

Also ensure any build/typecheck/lint examples reflect actual root scripts.

**Step 4: Keep migration notes honest but secondary**

Retain `pi-memory-md` comparison/reference notes only where they help users understand compatibility or missing parity. Do not delete useful reference sections unless replacement wording preserves same truth.

**Step 5: Manual truthfulness review**

Check edited README against current repo reality:
- does every listed command exist?
- does every claimed packaged skill exist?
- does wording avoid claiming UI parity?
- does wording avoid claiming real linting?

**Step 6: Commit**

```bash
git add README.md
git commit -m "docs: position pi-context as ship-ready for non-ui use"
```

---

### Task 4: Rewrite package READMEs to match stable-core / ship-ready posture

**TDD scenario:** Trivial change — use judgment

**Files:**
- Modify: `packages/pi-memory-core/README.md`
- Modify: `packages/pi-context/README.md`

**Step 1: Update `@pi-context/pi-memory-core` README**

Replace scaffold wording in `packages/pi-memory-core/README.md` with concise publishable wording.

Minimum required content:
- package is harness-agnostic core for `pi-context`
- package contains stable shared logic used today
- package is not a standalone end-user Pi package
- package surface includes config/models/types/memory/git/hooks/tape primitives already exported

Suggested replacement structure:

```md
# @pi-context/pi-memory-core

Harness-agnostic shared memory core for `pi-context`.

## Status

Stable core package used by `pi-context` today.
It provides reusable non-UI memory, git sync, hook, and tape gate primitives.
It is not intended to be installed directly as a Pi end-user package.
```

**Step 2: Update `pi-context` package README**

Rewrite `packages/pi-context/README.md` so it describes current working capability first, then explicitly lists what remains incomplete.

Required content goals:
- remove "no longer just scaffold" wording
- keep the concrete implemented capabilities list if still accurate
- compress migration/extraction narrative
- keep parity gaps explicit
- mention packaged skills truthfully
- mention that lint scripts are placeholder-only if the README tells users to run lint

**Step 3: Keep internal terminology honest**

If `adapter-shell` remains in runtime metadata, docs should avoid exposing it as a maturity claim. Treat it as internal implementation detail, not public product posture.

**Step 4: Manual consistency check**

Confirm the three README files now agree on these points:
- practical non-UI use is ready now
- advanced UI parity is still missing
- `pi-memory-core` is stable shared core
- `pi-context` is the installable Pi package
- lint is not overclaimed

**Step 5: Commit**

```bash
git add packages/pi-memory-core/README.md packages/pi-context/README.md
git commit -m "docs: align package readmes with ship-ready posture"
```

---

### Task 5: Run full workspace verification with correct root commands

**TDD scenario:** Modifying tested code — run full verification after changes

**Files:**
- Reference: `package.json`
- Reference: `packages/pi-memory-core/package.json`
- Reference: `packages/pi-context/package.json`

**Step 1: Build workspace**

Run: `npm run build`
Expected: PASS

**Step 2: Typecheck workspace**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Test workspace**

Run: `npm run test`
Expected: PASS

**Step 4: Lint workspace**

Run: `npm run lint`
Expected: PASS with placeholder echo output from each package, not real lint diagnostics

**Step 5: Capture exact outputs for final note**

Record any warnings or placeholder output so the final summary stays truthful.

**Step 6: Commit if needed**

If verification caused any intentional doc-only touchups, make one final docs commit. Otherwise skip commit.

---

### Task 6: Final quality pass for truthfulness and publishability

**TDD scenario:** Trivial change — use judgment

**Files:**
- Review only changed files and `package.json` manifests

**Step 1: Check changed-file diff**

Run: `git diff -- packages/pi-memory-core/src/index.ts packages/pi-memory-core/tests/smoke.test.js packages/pi-memory-core/README.md packages/pi-context/tests/smoke.test.js packages/pi-context/tests/adapter.test.js packages/pi-context/README.md README.md`
Expected: only metadata/test-title/docs truthfulness changes

**Step 2: Run targeted wording search**

Run:

```bash
rg -n "scaffold|successor/migration target|no longer just scaffold|production-ready|fully parity|full parity" README.md packages
```

Expected:
- no stale scaffold wording in active package docs/tests unless deliberately retained as historical note
- no overclaim like full parity or production-ready unless fully justified

**Step 3: Check publishability facts**

Manually confirm:
- root package remains `private: true`
- package versions still consistent at `0.1.0`
- `pi-context` remains installable from repo for Pi users
- docs do not imply npm registry publication if that is not configured

**Step 4: Decide finish state**

Use this decision rule:
- if build/typecheck/test/lint all pass and wording is honest, call repo **ready to ship** and **ready to publish from repo install flow**
- do not call it fully parity-complete or fully production-hardened beyond current tested non-UI scope

**Step 5: Final commit**

```bash
git add README.md packages/pi-memory-core/src/index.ts packages/pi-memory-core/tests/smoke.test.js packages/pi-memory-core/README.md packages/pi-context/tests/smoke.test.js packages/pi-context/tests/adapter.test.js packages/pi-context/README.md
git commit -m "docs: finalize ship-readiness positioning"
```

---

## Expected outcome

After this plan:
- no active package or smoke test calls `pi-memory-core` a scaffold
- package docs lead with practical ship-ready usage, not migration history
- root command examples use `npm run test`
- lint is described honestly as placeholder-only
- verification evidence supports calling repo ready to ship and ready to publish via Pi repo install flow

## Not in scope yet

Do not do these in this plan:
- add real lint configuration
- chase full `pi-memory-md` parity
- add UI/overlay features
- restructure package boundaries
- change versions or release automation
