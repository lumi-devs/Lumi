#!/usr/bin/env bash
set -euo pipefail

# Lumi v2 Development Setup & Bootstrapper Script
# Provisions PostgreSQL 18 & Redis via Docker, runs Prisma migrations, and launches services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== Lumi v2 Environment Setup ==="
cd "${ROOT_DIR}"

# Check for .env file
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    # Generate random passwords if empty
    POSTGRES_PW=$(openssl rand -hex 16 2>/dev/null || date +%s | sha256sum | head -c 32)
    REDIS_PW=$(openssl rand -hex 16 2>/dev/null || date +%s | sha256sum | head -c 32)
    RPC_TOKEN=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | head -c 64)
    
    sed -i "s/POSTGRES_PASSWORD=/POSTGRES_PASSWORD=${POSTGRES_PW}/" .env || true
    sed -i "s/REDIS_PASSWORD=/REDIS_PASSWORD=${REDIS_PW}/" .env || true
    sed -i "s/RPC_INTERNAL_TOKEN=/RPC_INTERNAL_TOKEN=${RPC_TOKEN}/" .env || true
    echo ".env created with generated secrets."
  else
    echo "ERROR: Neither .env nor .env.example found."
    exit 1
  fi
fi

echo "Starting PostgreSQL and Redis containers..."
docker compose up -d postgres redis

echo "Waiting for PostgreSQL to be healthy..."
docker compose exec -T postgres sh -c 'until pg_isready -U lumi -d lumi; do sleep 1; done'

echo "Waiting for Redis to be healthy..."
docker compose exec -T redis sh -c 'until redis-cli ping; do sleep 1; done'

echo "Running Prisma migrations..."
bun run db:migrate:deploy || bunx prisma migrate deploy

echo "Generating Prisma client..."
bun run db:generate || bunx prisma generate

echo "=== Setup complete! ==="
echo "You can now run:"
echo "  - Bot: bun run start"
echo "  - Dashboard: bun run --cwd apps/dashboard dev"
echo "  - Full Docker stack: docker compose up"
