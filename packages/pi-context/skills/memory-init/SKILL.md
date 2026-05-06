---
name: memory-init
description: Initialize memory repository - clone git repo and create directory structure. Use when you need to set up pi-context for the first time or initialize project's memory files.
---

## Overview

1. Run [scripts/memory-init.sh](scripts/memory-init.sh) to clone/sync repo and create directories
2. Read and copy template files from [templates/](templates/) (user decides which)

## Prerequisites

Before running this skill, ensure:
- Package installed: `pi install npm:pi-context`
- Settings configured with `repoUrl` in your settings file
- Git repository created and accessible

## Execution Steps

### Step 1: Run Initialization Script

Execute the initialization script: [scripts/memory-init.sh](scripts/memory-init.sh)

The script will:
1. Read settings from `.pi/settings.json` or `$PI_CODING_AGENT_DIR/settings.json`
2. Calculate memory directories
3. Clone or sync the git repository
4. Create `core/project/`

### Step 2: Configure globalMemory (if applicable)

Read settings from `.pi/settings.json` or `$PI_CODING_AGENT_DIR/settings.json` and check for `globalMemory` configuration.

Then ask user whether they also want to create default global files under the configured `globalMemory` directory:
- `{globalMemory}/USER.md` from `user-template.md`
- `{globalMemory}/MEMORY.md` from `memory-template.md`
- `{globalMemory}/TASK.md` from `task-template.md`

### Step 3: Copy Template Files for Project Memory (Optional)

Ask user which project templates to create in [templates/](templates/):

```txt
Which project template files would you like to create? (select all that apply)
1. task-template.md - Project tasks and planning template
2. user-template.md - Project user profile and preferences template
3. None (skip project templates)
```

If user selects templates, copy them from `templates/` to the target paths:

```bash
cp templates/task-template.md {projectMemoryDir}/core/TASK.md
cp templates/user-template.md {projectMemoryDir}/core/USER.md
```

### Step 4: Import Preferences from AGENTS.md (Optional)

This step extracts preferences from AGENTS.md to populate project `core/USER.md` and, if global memory is enabled, `{globalMemory}/USER.md`.

1. **Find AGENTS.md** (check in order):
   - Project root: `{cwd}/AGENTS.md`
   - Project: `{cwd}/.pi/agent/AGENTS.md`
   - Global: `~/.pi/agent/AGENTS.md`

2. **Ask user**: Do you want to import preferences from AGENTS.md?
   - If NO, skip to "Summarize and confirm"
   - If YES, continue

3. **Read AGENTS.md** and extract relevant sections:
   - IMPORTANT Rules
   - Code Quality Principles
   - Coding Style Preferences
   - Architecture Principles
   - Development Workflow
   - Technical Preferences

4. **Summarize and confirm**:
   ```
   Found these preferences in AGENTS.md:
   - IMPORTANT Rules: [1-2 sentence summary]
   - Code Quality Principles: [1-2 sentence summary]
   - Coding Style: [1-2 sentence summary]

   Include these in project core/USER.md and, if available, {globalMemory}/USER.md? (yes/no)
   ```

5. **If confirmed**, update or create the target profile files with:
   - `core/USER.md`
   - `{globalMemory}/USER.md` if global memory is enabled
   - Extracted content from AGENTS.md
   - Keep the existing frontmatter (description, tags, created)

6. **Ask for additional preferences**:
   ```
   Any additional preferences to add to USER.md? (e.g., communication style, specific tools)
   ```

### Step 5: Create Additional Folders (Optional)

Ask user whether they want to create any additional folders beyond `core/project`.

Examples:
- `reference/`
- `archive/`
- Any custom project-specific folder

If YES, ask for the folder names and create them under the project memory directory.

### Step 6: Verify Setup

Call `memory_check` tool to verify setup is correct.

## Memory Repository Structure

```txt
{localPath}/
├── {globalMemory}/            # (if globalMemory config block exists)
│   ├── USER.md                # Shared user profile and preferences
│   ├── MEMORY.md              # Shared durable notes, conventions, and lessons learned
│   └── TASK.md                # Shared task and planning file
└── {project-name}/
    └── core/
        ├── USER.md            # Project user profile and preferences
        ├── project/           # Project memory files
        └── TASK.md            # Task and planning file
```

## Error Handling

| Error | Solution |
|-------|----------|
| `settings not found` | Configure `pi-context` settings file |
| `repoUrl not configured` | Add `repoUrl` to settings |
| `Permission denied` | Check SSH keys: `ssh -T git@github.com` |
| `Directory exists but not git` | Remove directory manually and retry |
| `Connection timeout` | Check network, try again |

## Templates

Copy these templates to start:

- [templates/task-template.md](templates/task-template.md) — Project tasks and planning template
- [templates/user-template.md](templates/user-template.md) — User profile and preferences template
- [templates/memory-template.md](templates/memory-template.md) — Durable notes, conventions, and lessons learned template for `globalMemory` only

## Scripts

- [scripts/memory-init.sh](scripts/memory-init.sh) — Initialize memory repository (clone repo, create minimal directories)
