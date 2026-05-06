# pi-context workspace

Production-oriented monorepo workspace for `pi-context`.

## Purpose

This workspace will combine:
- smart Pi-native memory learning concepts from `pi-memory`
- advanced context orchestration concepts from `magic-context`
- git-backed structured markdown memory from `pi-memory-md`

## Planned packages

- `packages/pi-memory-core` — harness-agnostic memory engine
- `packages/pi-context` — Pi adapter and installable Pi package

## Current state

This is bootstrap scaffolding for the monorepo. Existing sibling directories remain reference inputs during extraction:

- `magic-context/`
- `pi-memory/`
- `pi-memory-md/`

They are source references for architecture and migration, not the final package layout.

## Design docs

- `docs/plans/2026-05-06-pi-context-design.md`
- `docs/plans/2026-05-06-pi-context-implementation-plan.md`
