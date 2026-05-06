#!/bin/bash
# memory-init.sh
# Initializes the memory repository

set -e

log() { echo "[memory-init] $1"; }
error() { echo "[memory-init] Error: $1" >&2; }
warn() { echo "[memory-init] Warning: $1" >&2; }

find_settings() {
  local project_settings="$(pwd)/.pi/settings.json"
  local agent_dir="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
  local global_settings="$agent_dir/settings.json"
  
  if [ -f "$project_settings" ] && grep -q '"pi-context"' "$project_settings" 2>/dev/null; then
    echo "$project_settings"
  elif [ -f "$global_settings" ] && grep -q '"pi-context"' "$global_settings" 2>/dev/null; then
    echo "$global_settings"
  fi
}

get_project_name() {
  if git rev-parse --show-toplevel &>/dev/null; then
    git rev-parse --show-toplevel | xargs basename
  else
    basename "$(pwd)"
  fi
}

get_safe_global_dirname() {
  local directory_name="$1"
  local trimmed_name
  local safe_directory_name

  trimmed_name=$(printf '%s' "$directory_name" | xargs)
  safe_directory_name=$(basename "$trimmed_name")
  safe_directory_name=$(printf '%s' "$safe_directory_name" | sed 's/^\.\+$/global/')

  if [ -z "$safe_directory_name" ]; then
    echo "global"
  else
    echo "$safe_directory_name"
  fi
}

main() {
  log "Starting memory initialization..."
  
  SETTINGS_FILE=$(find_settings)
  if [ -z "$SETTINGS_FILE" ]; then
    error "pi-context settings not found. Configure settings first."
    exit 1
  fi
  
  log "Using settings: $SETTINGS_FILE"
  
  if command -v jq &> /dev/null; then
    REPO_URL=$(jq -r '."pi-context".memoryDir.repoUrl // ."pi-context".repoUrl // empty' "$SETTINGS_FILE")
    LOCAL_PATH=$(jq -r '."pi-context".memoryDir.localPath // ."pi-context".localPath // empty' "$SETTINGS_FILE")
    GLOBAL_MEMORY=$(jq -r '."pi-context".memoryDir.globalMemory // ."pi-context".globalMemory // empty' "$SETTINGS_FILE")
  else
    warn "jq is not installed. Falling back to grep/sed parsing for settings. Install jq for more reliable JSON parsing."
    REPO_URL=$(grep -o '"repoUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$SETTINGS_FILE" | sed 's/.*:[[:space:]]*"\([^"]*\)"/\1/')
    LOCAL_PATH=$(grep -o '"localPath"[[:space:]]*:[[:space:]]*"[^"]*"' "$SETTINGS_FILE" | sed 's/.*:[[:space:]]*"\([^"]*\)"/\1/')
    GLOBAL_MEMORY=$(grep -o '"globalMemory"[[:space:]]*:[[:space:]]*"[^"]*"' "$SETTINGS_FILE" | sed 's/.*:[[:space:]]*"\([^"]*\)"/\1/')
  fi
  
  LOCAL_PATH="${LOCAL_PATH:-$HOME/.pi/memory-md}"
  LOCAL_PATH=$(eval echo "$LOCAL_PATH")
  
  if [ -z "$REPO_URL" ]; then
    error "repoUrl not configured in settings"
    exit 1
  fi
  
  PROJECT_NAME=$(get_project_name)
  PROJECT_DIR="$LOCAL_PATH/$PROJECT_NAME"
  GLOBAL_ENABLED=$([ -n "$GLOBAL_MEMORY" ] && echo "true" || echo "false")
  SAFE_GLOBAL_MEMORY=$(get_safe_global_dirname "$GLOBAL_MEMORY")
  GLOBAL_DIR="$LOCAL_PATH/$SAFE_GLOBAL_MEMORY"
  
  log "Project: $PROJECT_DIR"
  [ "$GLOBAL_ENABLED" = "true" ] && log "Global: $GLOBAL_DIR"
  
  if [ -d "$PROJECT_DIR/core/project" ] || [ -f "$PROJECT_DIR/core/TASK.md" ] || [ -f "$PROJECT_DIR/core/USER.md" ] || [ -f "$PROJECT_DIR/core/MEMORY.md" ]; then
    log "Memory already initialized at $PROJECT_DIR"
    log "Remove the existing core entries manually if you want to re-initialize"
    exit 0
  fi
  
  if [ ! -d "$LOCAL_PATH" ]; then
    log "Cloning repository..."
    git clone "$REPO_URL" "$LOCAL_PATH"
  elif [ ! -d "$LOCAL_PATH/.git" ]; then
    error "Directory exists but is not a git repository: $LOCAL_PATH"
    exit 1
  else
    log "Syncing repository..."
    cd "$LOCAL_PATH"
    git fetch origin
    git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || log "No remote changes"
  fi
  
  log "Creating directories..."
  mkdir -p "$PROJECT_DIR/core/project"
  
  if [ "$GLOBAL_ENABLED" = "true" ]; then
    mkdir -p "$GLOBAL_DIR"
  fi
  
  log "Memory initialized successfully!"
  log "  Project: $PROJECT_DIR"
  [ "$GLOBAL_ENABLED" = "true" ] && log "  Global: $GLOBAL_DIR"
}

main "$@"
