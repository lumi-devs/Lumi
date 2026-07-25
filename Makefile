.DEFAULT_GOAL := help

# The core backing services needed for local dev
DOCKER_SERVICES := postgres pgbouncer redis rabbitmq

.PHONY: help dev setup db clean

help:
	@echo "Lumi Dev Stack"
	@echo "  make dev      - Start DBs in Docker and run apps locally via Turbo"
	@echo "  make setup    - Install deps, start DBs, run Prisma migrations"
	@echo "  make db       - Start only the backing services (Postgres, Redis, etc.)"
	@echo "  make clean    - Stop Docker services and wipe volumes"

dev: db
	@echo "Starting Lumi workspaces..."
	@bun run dev

setup:
	@bun install
	@$(MAKE) db
	@bun run db:push
	@bun run db:generate
	@echo "Setup complete! Run 'make dev' to start."

db:
	@docker compose up -d $(DOCKER_SERVICES)
	@echo "Waiting for backing services..."
	@sleep 3

clean:
	@docker compose down -v --remove-orphans
