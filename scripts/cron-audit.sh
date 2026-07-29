#!/usr/bin/env bash
set -e

# 1. Resolve repository root and CD to it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# 2. Setup logs directory and log file
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/audit-cron.log"

# Log rotation: if log file > 2MB (2097152 bytes), truncate keeping the last 2000 lines
if [ -f "$LOG_FILE" ]; then
  LOG_SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$LOG_SIZE" -gt 2097152 ]; then
    TAIL_TMP=$(mktemp)
    tail -n 2000 "$LOG_FILE" > "$TAIL_TMP"
    mv "$TAIL_TMP" "$LOG_FILE"
  fi
fi

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 3. Resolve Node and NPX executables across common locations
NODE_EXEC=""
NPX_EXEC=""

# Search paths for Node & NPX
CANDIDATE_PATHS=(
  "$(which node 2>/dev/null)"
  "/opt/homebrew/bin/node"
  "/usr/local/bin/node"
  "/usr/bin/node"
)

# Search NVM or FNM node versions if present
if [ -d "$HOME/.nvm/versions/node" ]; then
  LATEST_NVM=$(ls -d "$HOME/.nvm/versions/node"/v* 2>/dev/null | tail -n 1)
  if [ -n "$LATEST_NVM" ] && [ -x "$LATEST_NVM/bin/node" ]; then
    CANDIDATE_PATHS+=("$LATEST_NVM/bin/node")
  fi
fi

if [ -d "$HOME/.fnm/current/bin" ] && [ -x "$HOME/.fnm/current/bin/node" ]; then
  CANDIDATE_PATHS+=("$HOME/.fnm/current/bin/node")
fi

for cand in "${CANDIDATE_PATHS[@]}"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then
    NODE_EXEC="$cand"
    CAND_DIR="$(dirname "$cand")"
    if [ -x "$CAND_DIR/npx" ]; then
      NPX_EXEC="$CAND_DIR/npx"
    fi
    break
  fi
done

if [ -z "$NPX_EXEC" ]; then
  NPX_EXEC="$(which npx 2>/dev/null || true)"
fi

# 4. Source environment variables from .env.local or .env
if [ -f "$REPO_ROOT/.env.local" ]; then
  set -a
  source "$REPO_ROOT/.env.local"
  set +a
elif [ -f "$REPO_ROOT/.env" ]; then
  set -a
  source "$REPO_ROOT/.env"
  set +a
fi

DRY_RUN=false
if [ "$1" == "--dry-run" ]; then
  DRY_RUN=true
fi

log "=== Price Audit Cron Execution Started ==="
log "Repository Root: $REPO_ROOT"
log "Node Executable: ${NODE_EXEC:-NOT FOUND}"
log "NPX Executable:  ${NPX_EXEC:-NOT FOUND}"
log "GEMINI_API_KEY:  $([ -n "$GEMINI_API_KEY" ] && echo "SET" || echo "MISSING")"
log "MONGODB_URI:     $([ -n "$MONGODB_URI" ] && echo "SET" || echo "MISSING")"

LOCK_FILE="$REPO_ROOT/db-storage/audit-prices.lock"
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(grep -o '"pid":[0-9]*' "$LOCK_FILE" 2>/dev/null | cut -d':' -f2 || true)
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    log "Lock file exists and PID $LOCK_PID is actively running."
    if [ "$DRY_RUN" = true ]; then
      log "[DRY RUN] Lock check: BLOCKED by active run (PID $LOCK_PID)."
    fi
    exit 1
  else
    log "Lock file exists but process PID ${LOCK_PID:-unknown} is stale."
  fi
else
  log "Lock file status: CLEAR (no active audit running)"
fi

if [ -z "$NODE_EXEC" ] || [ -z "$NPX_EXEC" ]; then
  log "ERROR: Unable to locate Node.js or NPX binaries."
  exit 1
fi

if [ -z "$GEMINI_API_KEY" ]; then
  log "ERROR: GEMINI_API_KEY is not defined in .env.local or .env"
  exit 1
fi

if [ "$DRY_RUN" = true ]; then
  log "[DRY RUN SUCCESS] All paths, environment variables, and lock status verified cleanly."
  exit 0
fi

log "Launching audit script: $NPX_EXEC tsx scripts/audit-prices.ts --full"
"$NPX_EXEC" tsx scripts/audit-prices.ts --full >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

log "=== Price Audit Cron Execution Finished (Exit Code: $EXIT_CODE) ==="
exit $EXIT_CODE
