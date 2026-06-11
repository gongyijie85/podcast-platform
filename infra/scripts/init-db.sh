#!/usr/bin/env bash
# init-db.sh: Create the database if not exists.
# Used by docker compose one-shot init.
set -euo pipefail

DB_NAME="${POSTGRES_DB:-podcast}"
echo "==> init-db: ensuring database '${DB_NAME}' exists"

# Postgres image auto-creates POSTGRES_DB on first boot; this is a placeholder
# for future migrations / extensions. Keep idempotent.
psql -U "${POSTGRES_USER:-postgres}" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || psql -U "${POSTGRES_USER:-postgres}" -d postgres -c "CREATE DATABASE \"${DB_NAME}\""

# Optional: enable extensions (uuid, full-text, etc.)
psql -U "${POSTGRES_USER:-postgres}" -d "${DB_NAME}" <<SQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
SQL

echo "==> init-db: done"
