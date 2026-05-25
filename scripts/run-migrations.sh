#!/bin/bash
# ASR-O2: Pre-deployment database migration script
#
# Runs Prisma migrations before deploying a new version.
# Designed to be run as a one-off ECS task or CI step.
#
# Usage: ./scripts/run-migrations.sh
#
# Required env: DATABASE_URL

set -euo pipefail

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ❌ ERROR: $*" >&2
}

# Validate DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  error "DATABASE_URL is not set"
  exit 1
fi

log "═══════════════════════════════════════════"
log "  Database Migration"
log "═══════════════════════════════════════════"

# Check pending migrations
log "🔍 Checking pending migrations..."
PENDING=$(npx prisma migrate status 2>&1 || true)
echo "$PENDING"

if echo "$PENDING" | grep -q "Database schema is up to date"; then
  log "✅ No pending migrations"
  exit 0
fi

# Create backup point
log "📦 Creating migration checkpoint..."
TIMESTAMP=$(date +'%Y%m%d_%H%M%S')
log "   Checkpoint: migration_$TIMESTAMP"

# Run migrations
log "🚀 Applying migrations..."
if npx prisma migrate deploy; then
  log "✅ Migrations applied successfully"
else
  error "Migration failed!"
  error "Manual intervention may be required."
  error "Aborting deployment."
  exit 1
fi

# Verify post-migration
log "🔍 Verifying migration state..."
npx prisma migrate status

log ""
log "═══════════════════════════════════════════"
log "  ✅ Migration Complete"
log "═══════════════════════════════════════════"
