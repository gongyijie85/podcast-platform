#!/usr/bin/env bash
# seed.sh: Apply Prisma migrations + seed BGM tracks.
# Run inside backend container or local.
set -euo pipefail

cd "$(dirname "$0")/../../backend"

echo "==> Applying Prisma migrations"
pnpm prisma migrate deploy

echo "==> Seeding BGM tracks"
pnpm run seed:bgm

echo "==> seed.sh: done"
