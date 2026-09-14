#!/usr/bin/env bash
# Deploy the Workforce backend on a server running PM2.
#
#   ./scripts/deploy.sh              pull, install, migrate, build, reload
#   SEED_ADMIN=true ./scripts/deploy.sh   also (re)seed the platform admin
#
# Requires: node >= 24, pm2 installed globally, a populated .env in this directory.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and fill in production values first." >&2
  exit 1
fi

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Installing dependencies"
npm ci --omit=dev --ignore-scripts
npm run db:generate

echo "==> Applying database migrations"
npm run db:deploy

echo "==> Building"
npm run build

if [[ "${SEED_ADMIN:-false}" == "true" ]]; then
  echo "==> Seeding platform admin"
  npm run db:seed:admin:prod
fi

echo "==> Reloading PM2"
if pm2 describe workforce-api > /dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

pm2 status
echo "==> Deploy complete"
