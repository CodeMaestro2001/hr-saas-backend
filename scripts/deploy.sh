#!/usr/bin/env bash

set -Eeuo pipefail

APP_PATH="${1:-}"
if [[ -z "$APP_PATH" || "$APP_PATH" != /* ]]; then
  echo "Usage: bash scripts/deploy.sh /absolute/path/to/app" >&2
  exit 1
fi

cd "$APP_PATH"

for command_name in node npm npx pm2 curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is unavailable on the VPS: $command_name" >&2
    exit 1
  fi
done

if [[ ! -f .env ]]; then
  echo "Production .env is missing from $APP_PATH" >&2
  exit 1
fi

echo "Installing locked dependencies"
npm ci

echo "Generating Prisma client"
npm run prisma:generate

echo "Building the API"
npm run build

echo "Applying committed database migrations"
npx prisma migrate deploy

echo "Removing development-only dependencies"
npm prune --omit=dev

echo "Starting or reloading the API"
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

app_port="$(sed -nE 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*"?([0-9]+)"?[[:space:]]*$/\1/p' .env | tail -n 1)"
if [[ ! "$app_port" =~ ^[0-9]+$ ]]; then
  app_port=3000
fi

health_url="http://127.0.0.1:${app_port}/api/health"
for attempt in {1..10}; do
  if curl --fail --silent --show-error "$health_url" >/dev/null; then
    echo "Deployment health check passed: $health_url"
    exit 0
  fi
  sleep 2
done

echo "Deployment health check failed: $health_url" >&2
pm2 logs workforce-api --lines 50 --nostream || true
exit 1
