# pi-context Production Design

Date: 2026-05-06
Status: Drafted and validated in-session

## Goal

Build `pi-context` as a production-grade persistent memory and context orchestration product for Pi, combining:

- **smart learning** from `samfoy/pi-memory`
- **advanced context orchestration concepts** from `cortexkit/magic-context`
- **git-backed structured markdown memory** from `VandeeFeng/pi-memory-md`

The result should be:

- installable like `pi-memory-md`
- Pi-first in the first release
- architected for future multi-harness adapters
- safe, inspectable, and production maintainable
- capable of learning durable preferences, lessons, and project knowledge automatically
- capable of assembling better context than simple static memory injection

---

## Product Positioning

`pi-context` is not just a memory plugin.

It is a **memory + retrieval + consolidation + context assembly system** for coding agents.

Core product principles:

1. **Markdown is canonical for durable memory**
   - user-inspectable
   - versionable
   - portable
   - git-auditable

2. **SQLite is operational infrastructure**
   - indexing
   - retrieval stats
   - review queue
   - provenance
   - consolidation state
   - optional embeddings metadata

3. **Learning must be hybrid, not blind**
   - rules collect evidence
   - LLM normalizes and merges
   - confidence policy gates writes

4. **Context should be selected, not dumped**
   - retrieval should reflect project scope, prompt relevance, recent tool focus, and anchor history

5. **Pi integration should stay thin**
   - business logic belongs in reusable core

---

## Source Repository Insights

### 1. `pi-memory-md`

Best source for:

- installable Pi package shape
- git-backed markdown memory repository
- project/global directory conventions
- memory tools and skills
- tape/anchor foundations
- user-visible inspectability

Weaknesses to avoid carrying forward directly:

- too much logic concentrated in package-level runtime files
- search/retrieval is not yet strong enough for production-grade smart context assembly
- some packaging and platform rough edges
- skills exported in package manifest lag behind repo contents

### 2. `pi-memory`

Best source for:

- automatic learning from session history
- preference/correction extraction
- durable “lessons stick” model
- scoped injection mindset
- confidence-aware memory consolidation patterns

Weaknesses to avoid carrying forward directly:

- less transparent than markdown-first systems when used as sole storage model
- SQLite-only durable state would reduce auditability and portability

### 3. `magic-context`

Best source for:

- context orchestration mindset
- ranking and shaping context instead of static injection
- separation between orchestration adapters and feature runtime
- advanced memory selection and compaction ideas
- long-session awareness

Weaknesses to avoid carrying forward directly:

- too complex to port wholesale into Pi
- OpenCode-specific plugin architecture should not leak into core design
- historian/dreamer behavior must be simplified for Pi lifecycle constraints

---

## Final Product Decision Summary

The agreed product decisions for `pi-context` are:

- **Monorepo package set**
- Packages:
  - `packages/pi-memory-core`
  - `packages/pi-context`
- **Use `pi-memory-md` as architectural base scaffold**
- **Markdown canonical + SQLite operational hybrid**
- **Rules + LLM hybrid consolidation**
- **Pi-first, multi-harness-ready core**
- **Confidence-based automatic memory policy**
- **Review queue canonical in SQLite, markdown export optional**
- **Search stack: FTS/BM25 by default + optional embeddings**
- **Build as a production product, not an MVP**

---

## Monorepo Structure

Recommended top-level layout:

```txt
pi-context/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docs/
│   └── plans/
├── packages/
│   ├── pi-memory-core/
│   │   ├── package.json
│   │   ├── src/
│   │   └── tests/
│   └── pi-context/
│       ├── package.json
│       ├── src/
│       ├── skills/
│       ├── assets/
│       └── tests/
└── scripts/
```

### Why this structure

- `pi-memory-core` becomes harness-agnostic product heart
- `pi-context` becomes thin Pi adapter and distributable package
- future harness adapters can be added without polluting core:
  - `packages/opencode-context`
  - `packages/claude-context`
  - `packages/codex-context`

---

## Package Responsibilities

## `packages/pi-memory-core`

This package owns all durable product logic.

### Responsibilities

- config schema and normalization
- memory document models
- canonical markdown repository operations
- SQLite operational database
- git sync and sync policy enforcement
- session/tool observation ingestion
- candidate extraction
- LLM-assisted consolidation
- confidence scoring and merge policy
- review queue management
- retrieval and ranking
- context assembly
- tape/anchor logic
- optional embeddings integration
- import/export services

### Strict rule

`pi-memory-core` must not import Pi-specific APIs.

It should be usable later from any harness adapter.

### Recommended module layout

```txt
packages/pi-memory-core/src/
├── config/
├── models/
├── storage/
│   ├── markdown/
│   └── sqlite/
├── git/
├── ingest/
├── consolidation/
├── retrieval/
├── context/
├── review/
├── tape/
├── providers/
│   ├── llm/
│   └── embeddings/
└── services/
```

## `packages/pi-context`

This package owns Pi integration and installability.

### Responsibilities

- Pi extension bootstrap
- lifecycle hook registration
- Pi tool registration
- slash commands
- session capture adapter
- prompt injection adapter
- skills packaging
- user-facing configuration bridge
- assets/templates

### Strict rule

`packages/pi-context` should be thin. It should orchestrate core services, not reimplement them.

### Recommended module layout

```txt
packages/pi-context/
├── package.json
├── src/
│   ├── index.ts
│   ├── bootstrap/
│   ├── hooks/
│   ├── tools/
│   ├── commands/
│   └── adapters/
├── skills/
│   ├── memory-init/
│   ├── memory-import/
│   ├── memory-write/
│   ├── memory-review/
│   └── memory-search/
├── assets/
└── tests/
```

---

## Recommended Codebase Boundaries

### Layering rule

Dependency direction must be one-way:

```txt
Pi runtime → pi-context adapter → pi-memory-core services → storage/providers
```

Never allow:

- core importing Pi APIs
- storage calling UI adapters
- tools embedding merge logic directly
- prompt assembly writing files directly

### File size guidance

This is production code, so code should be split early.

Recommended limits:

- schema/model files: small and focused
- repositories/parsers: 100–250 LOC typical
- services: 150–350 LOC typical
- orchestrators: 300–500 LOC max
- Pi tool adapters: 50–180 LOC
- avoid single files acting as parser + policy + storage + formatter

### Service seams

Recommended core service classes/modules:

- `MarkdownMemoryRepository`
- `SqliteMemoryIndex`
- `GitMemorySyncService`
- `ObservationIngestService`
- `CandidateExtractionService`
- `ConsolidationService`
- `ConfidencePolicyService`
- `MergeDecisionService`
- `ReviewQueueService`
- `KeywordSearchService`
- `EmbeddingSearchService`
- `ContextAssemblyService`
- `TapeContextService`
- `AnchorService`
- `MemoryImportService`

This boundary line is the most important maintainability decision in the codebase.

---

## Canonical Memory Model

Durable memory must not be stored as an unstructured blob.

### Memory classes

Recommended classes of durable memory:

1. **User Profile Memory**
   - communication preferences
   - tool preferences
   - style preferences
   - recurring workflow preferences

2. **Project Memory**
   - architecture
   - conventions
   - constraints
   - known workflows
   - environment assumptions

3. **Decision Memory**
   - durable project/process decisions
   - rationale summaries
   - consequences and follow-ups

4. **Lesson Memory**
   - corrections
   - gotchas
   - “do X, not Y” guidance
   - repeated failure prevention

5. **Reference Memory**
   - imported docs
   - stable external knowledge
   - important implementation references

6. **Task/Working Memory**
   - lower durability
   - useful for queued or staged context
   - not always auto-injected

---

## Markdown Repository Structure

Recommended canonical repository layout:

```txt
{memory-root}/
├── global/
│   ├── USER.md
│   ├── MEMORY.md
│   └── TASK.md
├── {project-name}/
│   ├── core/
│   │   ├── USER.md
│   │   ├── TASK.md
│   │   └── project/
│   │       ├── architecture.md
│   │       ├── conventions.md
│   │       └── workflows.md
│   ├── decisions/
│   │   └── *.md
│   ├── lessons/
│   │   └── *.md
│   ├── references/
│   │   └── *.md
│   ├── daily/
│   │   └── YYYY-MM-DD.md
│   └── exports/
│       └── review-queue/
└── TAPE/
    ├── project-anchors.jsonl
    └── global-anchors.jsonl
```

### Why this layout

- preserves `pi-memory-md` strengths
- makes durable memory human-auditable
- separates memory type by meaning
- prevents noisy single-file growth
- leaves room for imports, exports, and generated summaries without polluting core durable memory

---

## SQLite Operational Layer

SQLite exists to support performance, auditability, ranking, and review workflows.

### SQLite is not canonical for durable memory

Instead, SQLite tracks operational state derived from markdown plus session evidence.

### Recommended tables

- `memory_documents`
- `memory_fragments`
- `memory_tags`
- `memory_links`
- `retrieval_hits`
- `session_candidates`
- `candidate_evidence`
- `consolidation_runs`
- `review_queue`
- `review_decisions`
- `anchors`
- `anchor_links`
- `tool_observations`
- `memory_stats`
- `embedding_vectors` or external embedding references

### Roles of the SQLite layer

- fast keyword retrieval
- candidate and evidence staging
- confidence scores and provenance
- tracking which sessions created which memories
- ranking by recency/frequency/importance
- review queue and moderation workflow
- optional semantic search support

---

## Learning and Consolidation Pipeline

The product should use a **rules + LLM hybrid** approach.

### Why hybrid

- rules are deterministic and cheap
- LLM is better for normalization, abstraction, and merge drafting
- hybrid reduces hallucinated memory creation
- hybrid makes confidence scoring explainable

### Production pipeline

#### Stage 1: observation capture

Collect inputs from:

- session messages
- user corrections
- explicit “remember this” requests
- tool usage traces
- file read/edit focus windows
- project metadata
- anchor/tape checkpoints

#### Stage 2: rule-based candidate extraction

Rules identify candidate memory from evidence, such as:

- explicit preference statements
- repeated corrections
- repeated tool choices
- stable project facts confirmed by codebase reads
- repeated workflow patterns
- architecture decisions found in docs/config/code

#### Stage 3: LLM normalization

The LLM should:

- deduplicate candidate memories
- rewrite them into durable form
- classify memory type
- estimate merge target
- identify ambiguity or low-confidence items
- generate merge-safe summary text

#### Stage 4: confidence policy

Every candidate is scored into one of three outcomes:

- **high confidence** → auto-merge
- **medium confidence** → review queue
- **low confidence** → discard

#### Stage 5: merge and persistence

For auto-merge items:

- locate best target memory document
- merge or append using policy rules
- update markdown canonical files
- refresh SQLite index
- record consolidation provenance

For queued items:

- store candidate in SQLite review queue
- optionally expose markdown export snapshot on demand

---

## Confidence Policy

Confidence policy must be explainable and stable.

### High-confidence examples

- user explicitly says “remember this”
- user clearly states a durable preference
- same correction appears more than once
- project fact is confirmed from repo evidence
- a lesson is both user-corrected and repeated

### Medium-confidence examples

- inferred convention from limited evidence
- possible but unconfirmed architecture pattern
- one-time correction that may be task-specific
- tool preference inferred from one session only

### Low-confidence examples

- temporary chatter
- speculative statements
- unresolved plans
- one-off details with no long-term value
- noisy transcript fragments

This policy should live in core as a configurable strategy.

---

## Review Queue Design

The agreed design is:

- **SQLite review queue canonical for operations**
- **markdown export optional on demand**

### Why this is best

- keeps canonical repo cleaner
- avoids cluttering durable memory with uncertain items
- supports triage, filtering, promotion, rejection, bulk review
- still allows markdown export when user wants inspectable artifacts

### Review queue operations

Needed product actions:

- list queued memory candidates
- inspect evidence/provenance
- approve and merge
- reject permanently
- edit before merge
- export queue snapshot to markdown for audit/review

---

## Retrieval and Search Stack

The agreed search design is:

- **FTS/BM25 always available**
- **optional embeddings when configured**

### Default retrieval stack

Use local keyword/phrase search over:

- document titles
- descriptions
- tags
- fragments
- lessons
- decisions
- references
- session-derived metadata

### Optional semantic retrieval

When embeddings are enabled:

- generate vector representations for fragments or summarized chunks
- combine semantic scores with keyword scores
- use semantic retrieval mainly for recall and reranking
- keep embeddings optional, never required for base product value

### Why this is production-right

- local-first and reliable by default
- no hard dependency on external embed provider
- semantic layer can improve recall without defining the whole product

---

## Context Assembly

This is the main place where `magic-context` ideas should influence the product.

### Principle

Do not inject whole memory dumps.

Instead, assemble a bounded context block based on relevance.

### Recommended context assembly inputs

- current prompt keywords/entities
- current project
- recent tool focus
- active files and line ranges
- durable user preferences
- relevant decisions and lessons
- anchor/tape proximity
- retrieval recency/frequency stats
- optional semantic similarity

### Recommended ranking factors

- direct prompt relevance
- explicit user priority class
- project scope match
- recent access recency
- repeated usefulness
- confidence score
- anchor proximity
- active file overlap
- lesson severity/importance

### Context output sections

Recommended injected sections:

- `user_preferences`
- `project_constraints`
- `relevant_lessons`
- `recent_project_context`
- `relevant_decisions`
- `reference_memories`
- `active_focus`

Keep final injected block bounded and intentionally shaped.

---

## Tape and Anchors

Tape/anchors should be promoted from optional side feature to a first-class retrieval signal.

### Recommended role

Anchors record intent transitions and task checkpoints.

Use them to:

- boost retrieval near meaningful transitions
- recover context around prior implementation waves
- link durable memories to originating task/session intent
- improve review provenance
- improve active focus reconstruction

### Product rule

Anchors should not merely be stored; they should actively influence ranking.

### Recommended anchor types

- `session/*`
- `task/*`
- `decision/*`
- `handoff/*`
- `review/*`
- `incident/*`

---

## Pi Integration Design

`packages/pi-context` should remain installable like `pi-memory-md`.

### Packaging goals

- install via git or npm
- export Pi extension
- export Pi skills
- optionally export prompt templates later
- preserve low-friction setup

### Expected package manifest shape

`packages/pi-context/package.json` should expose:

- extension entrypoint
- skill directories/files
- optional assets

Example direction:

```json
{
  "name": "pi-context",
  "keywords": ["pi-package", "pi-extension", "pi-skill", "memory", "context"],
  "pi": {
    "extensions": ["./dist/index.js"],
    "skills": [
      "./skills/memory-init/SKILL.md",
      "./skills/memory-import/SKILL.md",
      "./skills/memory-write/SKILL.md",
      "./skills/memory-review/SKILL.md",
      "./skills/memory-search/SKILL.md"
    ]
  }
}
```

### Pi-facing feature surface

#### Tools

Recommend carrying and extending:

- `memory_sync`
- `memory_list`
- `memory_search`
- `memory_check`
- `memory_review`
- `memory_queue`
- `memory_promote`
- `memory_reject`
- tape tools

#### Skills

Recommend shipping:

- `memory-init`
- `memory-import`
- `memory-write`
- `memory-search`
- `memory-review`
- `memory-curate`

#### Lifecycle hooks

Need Pi lifecycle support for:

- session start sync
- context index refresh
- prompt injection
- session observation capture
- session end consolidation
- shutdown sync push if configured

---

## Configuration Design

Recommended high-level configuration shape:

```json
{
  "pi-context": {
    "memoryDir": {
      "repoUrl": "git@github.com:username/repo.git",
      "localPath": "~/.pi/memory-md",
      "globalMemory": "global"
    },
    "delivery": "message-append",
    "hooks": {
      "sessionStart": ["pull"],
      "sessionEnd": ["push"]
    },
    "consolidation": {
      "enabled": true,
      "mode": "hybrid",
      "autoMergeConfidence": 0.9,
      "queueConfidence": 0.6
    },
    "retrieval": {
      "strategy": "hybrid",
      "fileLimit": 12,
      "enableEmbeddings": false
    },
    "tape": {
      "enabled": true,
      "mode": "auto"
    }
  }
}
```

### Config principles

- preserve familiar `pi-memory-md` concepts where possible
- add new settings additively
- keep defaults safe and local-first
- allow advanced features without making them mandatory

---

## Production Safety Requirements

This product should behave conservatively around memory writes.

### Required safety controls

- path traversal protection
- symlink-safe memory writes
- conflict-aware git sync behavior
- confidence gating before durable writes
- configurable review queue thresholds
- provenance retained for auto-merged content
- optional dry-run or review-only consolidation mode
- bounded context injection size
- graceful degradation when embeddings/provider unavailable

### Required operational guarantees

- product still useful with no embeddings configured
- product still useful when LLM consolidation disabled temporarily
- memory repo remains readable without the product installed
- sync failures do not corrupt local memory state

---

## Recommended Testing Strategy

This is production code, so tests should be layered from the beginning.

### `pi-memory-core` tests

- markdown parsing/writing
- path safety
- merge policy behavior
- confidence policy classification
- candidate extraction rules
- review queue operations
- retrieval ranking
- tape selection behavior
- git sync edge cases
- SQLite migrations and index rebuilds

### `pi-context` tests

- config bridging
- tool registration
- Pi lifecycle hook behavior
- context delivery formatting
- command/tool result formatting
- skill path packaging validation

### Integration tests

- installable package smoke tests
- clone/init/write/retrieve/review/sync flows
- end-of-session consolidation flow
- context injection flow with mixed durable memory
- Windows path behavior
- worktree detection behavior

### Non-negotiable platform coverage

- Windows
- Linux/macOS path semantics where possible

Because upstream `pi-memory-md` already showed Windows-path rough edges, cross-platform normalization must be treated as core product work, not cleanup.

---

## Recommended Implementation Strategy

### Foundation choice

Start from `pi-memory-md` because it already provides:

- Pi installability model
- memory repo structure
- tool/skill vocabulary
- tape concept
- git-backed canonical markdown workflow

### Then evolve in this order

1. create monorepo shell
2. move/fork `pi-memory-md` into `packages/pi-context`
3. extract reusable store/git/tape logic into `packages/pi-memory-core`
4. add SQLite operational layer
5. add candidate extraction and confidence policy
6. add hybrid consolidation pipeline
7. add improved retrieval/context assembly
8. add review queue and promotion/rejection tools
9. add optional embeddings
10. harden packaging/tests/docs for production release

### Key discipline

Do not copy `magic-context` wholesale.

Copy concepts and patterns only where they fit Pi runtime:

- ranked context assembly
- long-session awareness
- durable context shaping
- optional background-like workflow stages where Pi lifecycle safely supports them

---

## Product Recommendation Summary

The best production architecture for this codebase is:

- **Fork `pi-memory-md` as base scaffold**
- **Restructure into monorepo**
- **Create `packages/pi-memory-core` as harness-agnostic engine**
- **Keep `packages/pi-context` as thin Pi adapter/installable package**
- **Use markdown as canonical durable memory**
- **Use SQLite for index, queue, provenance, ranking, and optional embeddings state**
- **Adopt rules + LLM hybrid consolidation**
- **Use confidence-based auto-merge/review/discard policy**
- **Use FTS/BM25 default retrieval plus optional embeddings**
- **Make tape/anchors first-class context signals**
- **Treat cross-platform path correctness and package installability as first-class production requirements**

This gives the best combination of:

- inspectability
- maintainability
- intelligence
- retrieval quality
- future extensibility
- installable Pi product ergonomics

---

## Recommended Next Step

Create implementation plan and repo bootstrap for:

1. monorepo scaffold
2. package extraction boundaries
3. package manifests/build system
4. first-pass core interfaces and migrations
5. first-pass Pi adapter wiring

That plan should precede code movement so the refactor stays coherent.
