#!/usr/bin/env bash
set -euo pipefail

# Lumi v2 Development Mode - Runs full stack via Docker Compose
# Usage: ./scripts/dev.sh [--logs] [--build] [--migrate]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

BUILD=false
SHOW_LOGS=false
RUN_MIGRATE=false

for arg in "$@"; do
  case "$arg" in
    --build) BUILD=true ;;
    --logs) SHOW_LOGS=true ;;
    --migrate) RUN_MIGRATE=true ;;
  esac
done

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Run ./scripts/setup.sh first."
  exit 1
fi

if [ "$BUILD" = true ]; then
  echo "Building images..."
  docker compose build
fi

if [ "$RUN_MIGRATE" = true ]; then
  echo "Running migrations..."
  docker compose --profile migrate run --rm migrate
fi

echo "Starting full stack..."
if [ "$SHOW_LOGS" = true ]; then
  docker compose up
else
  docker compose up -d
  echo "Stack running in background. Use 'docker compose logs -f' to follow logs."
  echo "Services:"
  echo "  Bot:      http://localhost:8091"
  echo "  Metrics:  http://localhost:9090"
  echo "  Dashboard: http://localhost:3000"
fi