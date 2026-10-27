#!/usr/bin/env bash
# Runs on the EC2 host. Updates the checkout to the given commit (default:
# origin/main) and rebuilds the container. The birthday-data volume is kept.
#
#   bash scripts/deploy.sh [commit-sha]
set -euo pipefail

cd "$(dirname "$0")/.."

target="${1:-origin/main}"
git fetch --prune origin main
git merge --ff-only "$target"

compose=(docker compose -f compose.yaml)
# The shared Nginx Proxy Manager network is configured through .env.
if grep -qE '^NPM_NETWORK=.+' .env 2>/dev/null; then
  compose+=(-f compose.npm.yaml)
fi

"${compose[@]}" up -d --build --wait --wait-timeout 180
"${compose[@]}" ps

# Old build layers fill small EC2 disks quickly. Volumes are never pruned here.
docker image prune -f >/dev/null

echo "Deployed $(git rev-parse --short HEAD)"
